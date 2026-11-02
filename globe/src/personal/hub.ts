import type { DayFile } from "@collector/day-schema";

/** the airports of the hub: the film and the live screen of the personal site show the flights that start or end here */
export const HUB_AIRPORTS: ReadonlySet<string> = new Set(["IST", "SAW"]);

/**
 * The day without the flights whose route is KNOWN and touches neither Istanbul airport (a Mediterranean charter, a domestic leg). A flight
 * whose route is not known yet (the collector could not look it up) stays: dropping it would empty the screen whenever the route service
 * is rate-limited.
 */
export function hubFlightsOnly(day: DayFile): DayFile {
  const known = (f: { from?: string; to?: string }): boolean => !!f.from && !!f.to;
  return { ...day, flights: day.flights.filter((f) => !known(f) || HUB_AIRPORTS.has(f.from ?? "") || HUB_AIRPORTS.has(f.to ?? "")) };
}
