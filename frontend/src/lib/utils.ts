/** Joins class names, skipping empty ones. (The shadcn helper of the same name, without tailwind-merge.) */
export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}
