import "server-only";
import { env } from "@/lib/env";
import { getAccessToken, invalidateAccessToken } from "./oauth";

// Thin client for the Zoho WorkDrive v1 REST API (JSON:API).
// Reference: https://www.zoho.com/workdrive/developer/docs/api/v1/

export type WdFile = {
  id: string;
  name: string;
  isFolder: boolean;
  extn: string | null;
  category: string | null;
  parentId: string | null;
  sizeBytes: number | null;
  createdMs: number | null;
  modifiedMs: number | null;
  modifiedBy: string | null;
  status: number;
  permalink: string | null;
};

export type WdRoot = { id: string; name: string; kind: "teamfolder" | "myfolder"; teamId: string; teamName: string | null };

export class WorkDriveError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    message: string,
  ) {
    super(message);
  }
}

type JsonApiResource = { id: string; type: string; attributes: Record<string, unknown> };
type JsonApiDoc = {
  data?: JsonApiResource | JsonApiResource[];
  links?: { cursor?: { has_next?: boolean; next?: string } };
  errors?: { id?: string; title?: string }[];
};

const MAX_ATTEMPTS = 4;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function request(url: string, init: RequestInit = {}, attempt = 1): Promise<Response> {
  const token = await getAccessToken();
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      Accept: "application/vnd.api+json",
      ...init.headers,
    },
    cache: "no-store",
  });

  if (res.status === 401 && attempt === 1) {
    await invalidateAccessToken();
    return request(url, init, attempt + 1);
  }
  if ((res.status === 429 || res.status >= 500) && attempt < MAX_ATTEMPTS) {
    const retryAfter = Number(res.headers.get("retry-after"));
    await sleep(retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 1000);
    return request(url, init, attempt + 1);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as JsonApiDoc;
    const err = body.errors?.[0];
    throw new WorkDriveError(res.status, err?.id, `WorkDrive ${res.status} ${err?.id ?? ""} ${err?.title ?? res.statusText}`.trim());
  }
  return res;
}

async function json(path: string, init?: RequestInit): Promise<JsonApiDoc> {
  const url = path.startsWith("http") ? path : `${env().ZOHO_API_URL}${path}`;
  const res = await request(url, init);
  // List endpoints answer 204 No Content for an empty folder.
  if (res.status === 204) return {};
  return (await res.json()) as JsonApiDoc;
}

const asArray = (d: JsonApiDoc["data"]) => (d === undefined ? [] : Array.isArray(d) ? d : [d]);
const str = (v: unknown) => (typeof v === "string" && v !== "" ? v : null);
const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v !== "" && !isNaN(+v) ? +v : null);

function toFile(r: JsonApiResource): WdFile {
  const a = r.attributes;
  const storage = (a.storage_info ?? {}) as Record<string, unknown>;
  return {
    id: r.id,
    name: String(a.name ?? ""),
    isFolder: a.is_folder === true || a.type === "folder",
    extn: str(a.extn),
    category: str(a.type),
    parentId: str(a.parent_id),
    sizeBytes: num(storage.size_in_bytes),
    createdMs: num(a.created_time_in_millisecond),
    modifiedMs: num(a.modified_time_in_millisecond),
    modifiedBy: str(a.modified_by),
    status: num(a.status) ?? 1,
    permalink: str(a.permalink),
  };
}

// ---------- account / discovery ----------

export async function getMe() {
  const [me] = asArray((await json("/users/me")).data);
  if (!me) throw new Error("WorkDrive /users/me returned no user");
  return {
    zuid: me.id,
    email: str(me.attributes.email_id),
    displayName: str(me.attributes.display_name),
  };
}

/** Every team folder the account belongs to plus its My Folders, across all its teams. */
export async function listRoots(zuid: string): Promise<WdRoot[]> {
  const roots: WdRoot[] = [];
  const teams = asArray((await json(`/users/${zuid}/teams`)).data);

  for (const team of teams) {
    const teamName = str(team.attributes.name);

    for (let offset = 0; ; offset += 50) {
      const page = asArray(
        (await json(`/teams/${team.id}/teamfolders?filter%5Btype%5D=userjoinedws&page%5Blimit%5D=50&page%5Boffset%5D=${offset}`)).data,
      );
      for (const tf of page) {
        roots.push({ id: tf.id, name: String(tf.attributes.name ?? tf.id), kind: "teamfolder", teamId: team.id, teamName });
      }
      if (page.length < 50) break;
    }

    const [member] = asArray((await json(`/teams/${team.id}/currentuser`)).data);
    if (member) {
      const [mySpace] = asArray(
        await json(`/users/${member.id}/privatespace`).then(
          (d) => d.data,
          () => undefined, // account may have My Folders disabled
        ),
      );
      if (mySpace) roots.push({ id: mySpace.id, name: "My Folders", kind: "myfolder", teamId: team.id, teamName });
    }
  }
  return roots;
}

// ---------- browsing ----------

/** All direct children of a folder (team folder, My Folders or regular folder), following cursors. */
export async function* listChildren(root: Pick<WdRoot, "kind">, folderId: string, isRoot: boolean): AsyncGenerator<WdFile[]> {
  const base = isRoot ? (root.kind === "teamfolder" ? "teamfolders" : "privatespace") : "files";
  let next: string | undefined = `/${base}/${folderId}/files?page%5Bnext%5D=0`;
  while (next) {
    const doc: JsonApiDoc = await json(next);
    const items = asArray(doc.data).map(toFile);
    if (items.length) yield items;
    next = doc.links?.cursor?.has_next ? doc.links.cursor.next : undefined;
  }
}

export async function getFile(id: string): Promise<WdFile> {
  const [r] = asArray((await json(`/files/${id}`)).data);
  if (!r) throw new WorkDriveError(404, undefined, `WorkDrive file ${id} not found`);
  return toFile(r);
}

/** Raw download response (stream it to the client; don't buffer large files). */
export async function download(id: string, version?: string): Promise<Response> {
  const url = new URL(`${env().ZOHO_DOWNLOAD_URL}/download/${encodeURIComponent(id)}`);
  if (version) url.searchParams.set("version", version);
  return request(url.toString());
}

// ---------- changes ----------

const jsonApiHeaders = { "Content-Type": "application/vnd.api+json" };

async function patchFile(id: string, attributes: Record<string, unknown>): Promise<WdFile> {
  const doc = await json(`/files/${id}`, {
    method: "PATCH",
    headers: jsonApiHeaders,
    body: JSON.stringify({ data: { attributes, type: "files" } }),
  });
  const [r] = asArray(doc.data);
  return r ? toFile(r) : getFile(id);
}

export const rename = (id: string, name: string) => patchFile(id, { name });
export const move = (id: string, parentId: string) => patchFile(id, { parent_id: parentId });
export const trash = (id: string) => patchFile(id, { status: "51" });
export const restore = (id: string) => patchFile(id, { status: "1" });

/** Permanently deletes a file or folder: trash first, then purge (WorkDrive only purges trashed items). */
export async function permanentlyDelete(id: string): Promise<void> {
  await trash(id);
  await patchFile(id, { status: "61" });
}

/** Deletes a team folder and everything in it. A Zoho team admin can restore it from WorkDrive's Admin Console within the retention period. */
export async function deleteTeamFolder(id: string): Promise<void> {
  await json(`/teamfolders/${id}`, { method: "DELETE" });
}

/** New team folder in a team. Private: only its members (the connected account) can see it in WorkDrive. */
export async function createTeamFolder(teamId: string, name: string, description?: string): Promise<{ id: string; name: string }> {
  const doc = await json("/teamfolders", {
    method: "POST",
    headers: jsonApiHeaders,
    body: JSON.stringify({ data: { attributes: { name, parent_id: teamId, is_public_within_team: false, ...(description ? { description } : {}) }, type: "teamfolders" } }),
  });
  const [r] = asArray(doc.data);
  if (!r) throw new Error("WorkDrive create team folder returned no data");
  return { id: r.id, name: String(r.attributes.name ?? name) };
}

export async function renameTeamFolder(id: string, name: string): Promise<void> {
  await json(`/teamfolders/${id}`, {
    method: "PATCH",
    headers: jsonApiHeaders,
    body: JSON.stringify({ data: { type: "teamfolders", id, attributes: { name } } }),
  });
}

export async function createFolder(parentId: string, name: string): Promise<WdFile> {
  const doc = await json("/files", {
    method: "POST",
    headers: jsonApiHeaders,
    body: JSON.stringify({ data: { attributes: { name, parent_id: parentId }, type: "files" } }),
  });
  const [r] = asArray(doc.data);
  if (!r) throw new Error("WorkDrive create folder returned no data");
  return toFile(r);
}

/**
 * Upload into a folder (≤ 250 MB). With overwrite = true, a same-named file gets a new top
 * version instead of being replaced, so earlier versions stay restorable.
 */
export async function upload(parentId: string, filename: string, content: Blob, overwrite: boolean): Promise<string> {
  const form = new FormData();
  form.set("content", content, filename);
  form.set("parent_id", parentId);
  form.set("filename", filename);
  form.set("override-name-exist", String(overwrite));
  const doc = await json("/upload", { method: "POST", body: form });
  // The upload response is undocumented; resource_id is where rclone and Zoho samples put the id.
  const [r] = asArray(doc.data);
  const id = str(r?.attributes?.resource_id) ?? r?.id;
  if (!id) throw new Error("WorkDrive upload returned no resource id");
  return id;
}

/** Adds a comment to a file in WorkDrive (shown in its comments panel there). */
export async function addComment(resourceId: string, html: string): Promise<void> {
  await json("/comments", {
    method: "POST",
    headers: jsonApiHeaders,
    body: JSON.stringify({ data: { attributes: { resource_id: resourceId, comment_html: html }, type: "comments" } }),
  });
}

export async function listVersions(id: string) {
  return asArray((await json(`/files/${id}/versions`)).data).map((v) => ({
    versionNumber: num(v.attributes.version_number),
    sizeBytes: num(v.attributes.file_size),
    createdMs: num(v.attributes.created_time_in_milliseconds),
    createdBy: str(v.attributes.created_by),
  }));
}
