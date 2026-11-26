const base = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

export const FolderIcon = () => (
  <svg {...base} aria-hidden="true">
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </svg>
);

export const FolderOpenIcon = () => (
  <svg {...base} aria-hidden="true">
    <path d="M5 19h12.5a1.5 1.5 0 0 0 1.45-1.1l1.8-6.4A1 1 0 0 0 19.8 10H8.5a1.5 1.5 0 0 0-1.45 1.1L5 19zm0 0a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v2" />
  </svg>
);

export const SheetIcon = () => (
  <svg {...base} aria-hidden="true">
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
    <path d="M9 14c1.2-2 2.4 1 3.6-1s1.8.5 2.4-.5" />
  </svg>
);

export const NewSheetIcon = () => (
  <svg {...base} aria-hidden="true">
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5M12 11v6M9 14h6" />
  </svg>
);

export const NewFolderIcon = () => (
  <svg {...base} aria-hidden="true">
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <path d="M12 10.5v5M9.5 13h5" />
  </svg>
);

export const TrashBinIcon = () => (
  <svg {...base} aria-hidden="true">
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
  </svg>
);

export const ChevronIcon = ({ open }: { open: boolean }) => (
  <svg
    {...base}
    width={14}
    height={14}
    aria-hidden="true"
    style={{
      transform: open ? "rotate(90deg)" : "none",
      transition: "transform 0.1s",
    }}
  >
    <path d="M9 6l6 6-6 6" />
  </svg>
);

/** Ícono de la pestaña "Hojas" del panel lateral. */
export const SheetsTabIcon = () => (
  <svg {...base} aria-hidden="true">
    <path d="M8 3h9a2 2 0 0 1 2 2v12" />
    <rect x="4" y="7" width="12" height="14" rx="2" />
    <path d="M7 14c1.4-2.2 2.6 1 4-1.2" />
  </svg>
);
