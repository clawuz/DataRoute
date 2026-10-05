import type { Region } from "@collector/day-schema";

export const REGIONS: Region[] = ["DOM", "EUR", "MEA", "AFR", "ASI", "AME", "UNK"];

export const REGION_LABEL: Record<Region, string> = {
  DOM: "DOMESTIC",
  EUR: "EUROPE",
  MEA: "MIDDLE EAST",
  AFR: "AFRICA",
  ASI: "ASIA-PACIFIC",
  AME: "AMERICAS",
  UNK: "UNKNOWN",
};

export const REGION_HEX: Record<Region, string> = {
  DOM: "#F2F4F8",
  EUR: "#3FC8F2",
  MEA: "#F7C548",
  AFR: "#7BD389",
  ASI: "#F2508F",
  AME: "#A98BFF",
  UNK: "#6B7280",
};

export const THY_RED = "#E30A17";

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export const REGION_RGB: [number, number, number][] = REGIONS.map((r) => hexToRgb(REGION_HEX[r]));
