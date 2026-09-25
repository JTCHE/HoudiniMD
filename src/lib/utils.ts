import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// The type scale in globals.css (`--text-*`) names sizes the merge does not
// know. Unknown, `text-caption` reads as a colour, and a `text-neutral-500`
// after it removed the size.
const twMerge = extendTailwindMerge({
  extend: {
    theme: { text: ["display", "lede", "title", "label", "meta", "caption"] },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
