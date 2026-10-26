import { routeHash } from "../audio/theory";
import { HUB } from "./destinations";
import { cardsOfAirport, type CardPlan, type GenreCard } from "./genres";
import type { PersonalRoute } from "./routes";

/** the places of a trip as sounds: home (where it leaves), Istanbul (where it changes planes), and the main card (where it goes) */
export interface Journey {
  /** the home card when it is not the main card; null otherwise */
  home: GenreCard | null;
  /** the Turkish card when the trip changes planes at Istanbul away from home; null otherwise */
  transit: GenreCard | null;
}

export type JourneySection = "intro" | "verse" | "build" | "chorus" | "break" | "outro";

/**
 * The trip told in order: it starts in the sound of home, passes through the sound of Istanbul (a trip that changes planes there,
 * away from home) and arrives in the sound of its destinations (the main card). Null when the trip has only one sound.
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
  const home = plan.home !== plan.main ? plan.home : null;
  return transit || home ? { home, transit } : null;
}

/**
 * The card whose sound a bar of the form plays: `null` = the main card, `undefined` = leave it to the verse's episodes (episodes.ts).
 * intro and outro: home; verse: Istanbul when the trip passes it, else the episodes; build and chorus: the main card;
 * break: Istanbul again on the way back.
 */
export function journeyCard(section: JourneySection, j: Journey): GenreCard | null | undefined {
  switch (section) {
    case "verse":
      return j.transit ?? undefined;
    case "break":
      return j.transit;
    case "intro":
    case "outro":
      return j.home;
    default:
      return null;
  }
}
