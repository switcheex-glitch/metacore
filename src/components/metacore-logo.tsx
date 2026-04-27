export function MetacoreLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 240 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Metacore"
      role="img"
    >
      <g transform="translate(4, 4)">
        <circle cx="16" cy="16" r="11" stroke="currentColor" strokeWidth="2.5" fill="none" />
        <ellipse
          cx="16"
          cy="16"
          rx="17"
          ry="4.5"
          stroke="currentColor"
          strokeWidth="2.2"
          fill="none"
          transform="rotate(-18 16 16)"
        />
      </g>
      <text
        x="46"
        y="28"
        fontFamily="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
        fontSize="22"
        fontWeight="800"
        letterSpacing="1.5"
        fill="currentColor"
      >
        METACORE
      </text>
    </svg>
  );
}
