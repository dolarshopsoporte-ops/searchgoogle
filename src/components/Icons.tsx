interface IconProps {
  className?: string;
}

const SVG_PROPS = {
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.4,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true
};

export function ExternalLink({ className = "h-3.5 w-3.5" }: IconProps) {
  return (
    <svg className={className} {...SVG_PROPS}>
      <path d="M9 3h4v4" />
      <path d="M13 3 7 9" />
      <path d="M11 9v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h3" />
    </svg>
  );
}

export function Download({ className = "h-3.5 w-3.5" }: IconProps) {
  return (
    <svg className={className} {...SVG_PROPS}>
      <path d="M8 3v8" />
      <path d="m4.5 7.5 3.5 3.5 3.5-3.5" />
      <path d="M3 13h10" />
    </svg>
  );
}

export function Spinner({ className = "h-3.5 w-3.5" }: IconProps) {
  return (
    <svg className={`${className} animate-spin`} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.5" />
      <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
