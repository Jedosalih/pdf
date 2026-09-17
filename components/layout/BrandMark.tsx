interface BrandMarkProps {
  className?: string;
}

/**
 * JPdf logomark: a rounded document tile with a folded corner (subtle
 * "document transformation" cue, blueprint §6) and a bold "J" glyph — not a
 * generic PDF icon. Uses the design tokens directly (`--color-primary`/
 * `--color-primary-hover`) so it always matches the current theme rather
 * than hardcoding hex values. Works at any size (header, favicon, future
 * dashboard/editor placements) since it's a plain inline SVG, not a raster
 * image.
 */
export function BrandMark({ className }: BrandMarkProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <clipPath id="jpdf-mark-clip">
          <rect width="32" height="32" rx="8" />
        </clipPath>
      </defs>
      <g clipPath="url(#jpdf-mark-clip)">
        <rect width="32" height="32" fill="var(--color-primary)" />
        <path d="M21 0H32V11L21 0Z" fill="var(--color-primary-hover)" />
        <path
          d="M18.5 8V19.4C18.5 23.6 16.1 26 12.2 26C10.4 26 8.8 25.5 7.5 24.6L9.1 21.2C9.9 21.7 10.7 22 11.5 22C13 22 13.8 21 13.8 19V8H18.5Z"
          fill="white"
        />
      </g>
    </svg>
  );
}
