import { clsx } from "clsx";
import type { ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

const compactNumberFormatter = new Intl.NumberFormat("en", {
  maximumFractionDigits: 1,
  notation: "compact",
});

const longNumberFormatter = new Intl.NumberFormat("en");

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCompactNumber(value: number) {
  return compactNumberFormatter.format(value);
}

export function formatLongNumber(value: number) {
  return longNumberFormatter.format(value);
}
