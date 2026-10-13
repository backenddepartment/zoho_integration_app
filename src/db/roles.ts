// Plain values shared by server and browser code (no database imports here).

export const ROLES = ["superadmin", "admin", "staff", "external"] as const;
export type Role = (typeof ROLES)[number];

/** Access levels on a folder or file, ordered: each includes everything below it. */
export const LEVELS = { view: 1, edit: 2, manage: 3, share: 4 } as const;
export type LevelName = keyof typeof LEVELS;

/** The names people see, modelled on WorkDrive's roles. */
export const ACCESS_ROLES: { level: number; key: LevelName; label: string; can: string }[] = [
  { level: 1, key: "view", label: "Viewer", can: "Browse, download and see versions" },
  { level: 2, key: "edit", label: "Editor", can: "Also upload, save new versions, create folders and rename" },
  { level: 3, key: "manage", label: "Organizer", can: "Also delete and move" },
  { level: 4, key: "share", label: "Folder admin", can: "Also share it with other people and change their access" },
];
export const levelLabel = (level: number) => ACCESS_ROLES.find((r) => r.level === level)?.label ?? "No access";

/** Admins and superadmins see and manage everything; only superadmins can delete permanently. */
export const isAdminRole = (role: Role | undefined | null) => role === "admin" || role === "superadmin";

/** Who did something, as written into WorkDrive names: "Jade Madigal, jade@getmeds.ph". */
export type Person = { name: string; email: string };
const credit = (p: Person) => `${p.name.replace(/[()\\/:*?"<>|,]/g, "").trim()}, ${p.email.replace(/[()\\/:*?"<>|,\s]/g, "")}`;
/** The person's name from a credit ("Jade Madigal, jade@…" → "Jade Madigal"); older tags have no email. */
const nameFromCredit = (c: string) => c.split(", ")[0];

// Deleting renames the item in WorkDrive so anyone looking there sees who deleted it:
//   "(Deleted by Jade Madigal, jade@getmeds.ph) Report.docx", or with a date when that name is taken:
//   "(Deleted by Jade Madigal, jade@getmeds.ph 2026-10-13 1215) Report.docx". Older items may say
//   "(Deleted by Jade Madigal) " or just "(Deleted) ".
export const DELETED_PATTERN = /^\(Deleted\b[^)]*\) /;
export const isDeletedName = (name: string) => DELETED_PATTERN.test(name);
export const stripDeleted = (name: string) => name.replace(DELETED_PATTERN, "");
export const deletedName = (name: string, by: Person, stamp?: string) => `(Deleted by ${credit(by)}${stamp ? ` ${stamp}` : ""}) ${name}`;
/** Who deleted it, read back from the name; null for the older "(Deleted) " form. */
export const deletedByFromName = (name: string) => {
  const c = name.match(/^\(Deleted by (.+?)(?: \d{4}-\d{2}-\d{2} \d{4})?\) /)?.[1];
  return c ? nameFromCredit(c) : null;
};

// Files and folders added through the app are named in WorkDrive after the person who added them,
// since WorkDrive itself credits the connected account: "(Added by Jade Madigal, jade@getmeds.ph) Report.docx".
// Inside the app the tag is hidden and shown as "Added by" instead.
export const ADDED_PATTERN = /^\(Added by [^)]*\) /;
export const addedName = (name: string, by: Person) => `(Added by ${credit(by)}) ${name}`;
export const addedByFromName = (name: string) => {
  const c = stripDeleted(name).match(/^\(Added by ([^)]*)\) /)?.[1];
  return c ? nameFromCredit(c) : null;
};
export const stripAdded = (name: string) => name.replace(ADDED_PATTERN, "");
/** The "(Added by …)" tag of a name, or "" — kept when renaming so the credit stays. */
export const addedTag = (name: string) => stripDeleted(name).match(ADDED_PATTERN)?.[0] ?? "";

/**
 * Zoho's own document formats (Writer, Sheet, Show…). WorkDrive turns uploaded Office files into
 * these when its "Convert all files to Zoho WorkDrive's format on upload" setting is on.
 */
export const isZohoNative = (extn: string | null | undefined) => /^z(writer|sheet|show|doc|xls|ppt|notebook)/i.test(extn ?? "");

/** The name people see in the app: no "(Deleted by …)" or "(Added by …)" tags. */
export const displayName = (name: string) => stripAdded(stripDeleted(name));
