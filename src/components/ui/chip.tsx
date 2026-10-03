import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** A selectable pill used for tabs, filters and single-choice pickers. */
export function Chip({
  selected,
  className,
  size = "md",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean; size?: "sm" | "md" | "lg" }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full border font-medium whitespace-nowrap transition-colors",
        size === "sm" && "h-8 px-3 text-xs",
        size === "md" && "h-10 px-4 text-sm",
        size === "lg" && "h-12 px-5 text-[15px]",
        selected
          ? "border-rose bg-rose text-white shadow-soft"
          : "border-beige bg-white text-ink-soft hover:border-sand hover:bg-cream",
        className,
      )}
      {...props}
    />
  );
}
