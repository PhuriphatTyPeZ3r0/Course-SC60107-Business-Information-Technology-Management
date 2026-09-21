import { cn } from "cn";

/**
 * Material Symbols Rounded glyph. Sizing is font-size driven - use a
 * text-[Npx] (or text-base/text-lg/...) className, not size-N, since this
 * is a ligature-based icon font, not an SVG with intrinsic dimensions.
 */
export function Icon({
  name,
  filled = false,
  className,
}: {
  name: string;
  filled?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn("material-symbols-rounded inline-block select-none leading-none", className)}
      style={{ fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' 400, 'GRAD' 0, 'opsz' 24` }}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}
