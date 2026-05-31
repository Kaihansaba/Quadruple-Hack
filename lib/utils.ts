export type ClassValue = string | number | false | null | undefined;

/** Minimal classnames helper — joins truthy class fragments. */
export function cn(...classes: ClassValue[]): string {
  return classes.filter(Boolean).join(" ");
}
