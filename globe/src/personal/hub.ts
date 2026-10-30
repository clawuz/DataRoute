import type { DayFile } from "@collector/day-schema";

/** the airports of the hub: the film and the live screen of the personal site show the flights that start or end here */
export const HUB_AIRPORTS: ReadonlySet<string> = new Set(["IST", "SAW"]);

/** The day without the flights that touch neither Istanbul airport (a Mediterranean charter, a domestic leg, a flight whose route is unknown). */
export function hubFlightsOnly(day: DayFile): DayFile {
  return { ...day, flights: day.flights.filter((f) => HUB_AIRPORTS.has(f.from ?? "") || HUB_AIRPORTS.has(f.to ?? "")) };
}
