// Plain values shared by server and browser code (no database imports here).

export const ROLES = ["superadmin", "admin", "staff", "external"] as const;
export type Role = (typeof ROLES)[number];

/** Admins and superadmins see and manage everything; only superadmins can delete permanently. */
export const isAdminRole = (role: Role | undefined | null) => role === "admin" || role === "superadmin";

// Deleting renames the item in WorkDrive so anyone looking there sees who deleted it:
//   "(Deleted by Jade Madigal) Report.docx", or with a date when that name is taken:
//   "(Deleted by Jade Madigal 2026-10-13 1215) Report.docx". Older items may just say "(Deleted) ".
export const DELETED_PATTERN = /^\(Deleted\b[^)]*\) /;
export const isDeletedName = (name: string) => DELETED_PATTERN.test(name);
export const stripDeleted = (name: string) => name.replace(DELETED_PATTERN, "");
export const deletedName = (name: string, by: string, stamp?: string) =>
  `(Deleted by ${by.replace(/[()\\/:*?"<>|]/g, "").trim()}${stamp ? ` ${stamp}` : ""}) ${name}`;
/** Who deleted it, read back from the name; null for the older "(Deleted) " form. */
export const deletedByFromName = (name: string) => name.match(/^\(Deleted by (.+?)(?: \d{4}-\d{2}-\d{2} \d{4})?\) /)?.[1] ?? null;

const cleanPerson = (by: string) => by.replace(/[()\\/:*?"<>|]/g, "").trim();

// Files and folders added through the app are named in WorkDrive after the person who added them,
// since WorkDrive itself credits the connected account: "(Added by Jade Madigal) Report.docx".
// Inside the app the tag is hidden and shown as "Added by" instead.
export const ADDED_PATTERN = /^\(Added by [^)]*\) /;
export const addedName = (name: string, by: string) => `(Added by ${cleanPerson(by)}) ${name}`;
export const addedByFromName = (name: string) => stripDeleted(name).match(/^\(Added by ([^)]*)\) /)?.[1] ?? null;
export const stripAdded = (name: string) => name.replace(ADDED_PATTERN, "");
/** The "(Added by …)" tag of a name, or "" — kept when renaming so the credit stays. */
export const addedTag = (name: string) => stripDeleted(name).match(ADDED_PATTERN)?.[0] ?? "";

/** The name people see in the app: no "(Deleted by …)" or "(Added by …)" tags. */
export const displayName = (name: string) => stripAdded(stripDeleted(name));
