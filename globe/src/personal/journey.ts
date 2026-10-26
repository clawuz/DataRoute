import { routeHash } from "../audio/theory";
import { HUB } from "./destinations";
import { episodeCards } from "./episodes";
import { cardsOfAirport, colourCardOf, type CardPlan, type GenreCard } from "./genres";
import type { PersonalRoute } from "./routes";

/** the three places of a trip as sounds: where it starts (the main card), the Turkish sound of Istanbul, where it arrives */
export interface Journey {
  /** the Turkish card when the trip changes planes at Istanbul away from home; null otherwise */
  transit: GenreCard | null;
  /** the card of the place it arrives at; null when it is the main card */
  dest: GenreCard | null;
}

export type JourneySection = "intro" | "verse" | "build" | "chorus" | "break" | "outro";

/**
 * The trip told in order: the piece starts in the sound of the place it leaves (the main card), passes through the sound of Istanbul
 * (a trip that changes planes there, away from home) and arrives in the sound of its destination. Null when the trip has only one sound.
 *  - transit: some route lands at the hub and the trip does not start there
 *  - dest: with a transit, the colour of the last leg's far end; without, the destination card with the most routes (episodes.ts)
 */
export function journeyOf(routes: readonly PersonalRoute[], plan: CardPlan): Journey | null {
  if (routes.length === 0) return null;
  const changes = routes[0].from !== HUB && routes.some((r) => r.to === HUB);
  let transit: GenreCard | null = null;
  if (changes) {
    const hubCards = cardsOfAirport(HUB, "UNK");
    transit = hubCards[routeHash(`${HUB}|${routes.map((r) => r.key).join(">")}`) % hubCards.length];
    if (transit === plan.main) transit = null;
  }
  const last = routes.length - 1;
  const candidate = changes ? colourCardOf(routes[last], last) : (episodeCards(plan)[0] ?? null);
  const dest = candidate && candidate !== plan.main && candidate !== transit ? candidate : null;
  return transit || dest ? { transit, dest } : null;
}

/**
 * The card whose sound a bar of the form plays: `null` = the main card (home), `undefined` = leave it to the verse's episodes (episodes.ts).
 * intro and outro: home; verse: Istanbul when the trip passes it (the three-sound trip), else the episodes; build and chorus: the destination;
 * break: Istanbul again on the way back.
 */
export function journeyCard(section: JourneySection, j: Journey): GenreCard | null | undefined {
  switch (section) {
    case "verse":
      return j.transit ?? undefined;
    case "build":
    case "chorus":
      return j.dest;
    case "break":
      return j.transit;
    default:
      return null;
  }
}
