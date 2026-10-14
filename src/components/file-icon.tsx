// A document icon coloured and labelled by file type (PDF, DOC, XLS, …), for file lists.

type Kind = { label: string; color: string };

const KINDS: Record<string, Kind> = {
  pdf: { label: "PDF", color: "#E5252A" },
  doc: { label: "DOC", color: "#2B579A" },
  xls: { label: "XLS", color: "#1D6F42" },
  csv: { label: "CSV", color: "#1D6F42" },
  ppt: { label: "PPT", color: "#D24726" },
  img: { label: "IMG", color: "#8B5CF6" },
  vid: { label: "VID", color: "#DB2777" },
  aud: { label: "AUD", color: "#0891B2" },
  zip: { label: "ZIP", color: "#B45309" },
  txt: { label: "TXT", color: "#64748B" },
  file: { label: "", color: "#94A3B8" },
};

const BY_EXT: Record<string, keyof typeof KINDS> = {
  pdf: "pdf",
  doc: "doc", docx: "doc", odt: "doc", rtf: "doc", pages: "doc",
  xls: "xls", xlsx: "xls", xlsm: "xls", ods: "xls", numbers: "xls",
  csv: "csv",
  ppt: "ppt", pptx: "ppt", odp: "ppt", key: "ppt",
  png: "img", jpg: "img", jpeg: "img", gif: "img", webp: "img", svg: "img", bmp: "img", heic: "img", tif: "img", tiff: "img",
  mp4: "vid", mov: "vid", avi: "vid", mkv: "vid", webm: "vid",
  mp3: "aud", wav: "aud", m4a: "aud", aac: "aud", ogg: "aud",
  zip: "zip", rar: "zip", "7z": "zip", tar: "zip", gz: "zip",
  txt: "txt", md: "txt", log: "txt", json: "txt", xml: "txt",
};

/** The file's kind from its WorkDrive extension, falling back to its name. Zoho's own formats map to their Office equivalents. */
function kindOf(name: string, extn: string | null | undefined): Kind {
  const ext = (extn || (name.includes(".") ? name.split(".").pop() : "") || "").toLowerCase();
  if (/^z(writer|doc)/.test(ext)) return KINDS.doc;
  if (/^z(sheet|xls)/.test(ext)) return KINDS.xls;
  if (/^z(show|ppt)/.test(ext)) return KINDS.ppt;
  return KINDS[BY_EXT[ext] ?? "file"];
}

export function FileIcon({ name, extn, className = "h-8 w-7" }: { name: string; extn?: string | null; className?: string }) {
  const { label, color } = kindOf(name, extn);
  return (
    <svg viewBox="0 0 28 32" className={`shrink-0 ${className}`} aria-hidden="true">
      {/* Page with a folded corner */}
      <path d="M4 1h14l8 8v20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2z" fill="#fff" stroke="#d4d4d8" strokeWidth="1.2" />
      <path d="M18 1v6a2 2 0 0 0 2 2h6" fill="#f4f4f5" stroke="#d4d4d8" strokeWidth="1.2" strokeLinejoin="round" />
      {label ? (
        <>
          <rect x="0" y="16" width="22" height="10" rx="2" fill={color} />
          <text x="11" y="23.6" textAnchor="middle" fontSize="7" fontWeight="700" fill="#fff" fontFamily="Poppins, system-ui, sans-serif">
            {label}
          </text>
        </>
      ) : (
        <path d="M7 15h12M7 19h12M7 23h8" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      )}
    </svg>
  );
}
