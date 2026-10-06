import { PROVIDERS, type AdsbProvider, type FetchFn } from "./adsb.js";
import type { CollectDeps } from "./collect.js";
import { OPENSKY_PROVIDER, createOpenSkyClient, type OpenSkyClient } from "./opensky.js";

export const DEFAULT_PROVIDER = "adsbfi";
export const PROVIDER_KEYS = [...Object.keys(PROVIDERS), "opensky"];

export interface Selection {
  provider: AdsbProvider;
  live?: CollectDeps["live"];
}

export interface OpenSkySecrets {
  clientId: () => string;
  clientSecret: () => string;
}

let openSky: OpenSkyClient | null = null; // module-level so the bearer token survives warm invocations

export function selectProvider(
  key: string,
  f: FetchFn,
  now: () => number,
  secrets: OpenSkySecrets | null,
): Selection {
  if (key === "opensky") {
    if (!secrets) throw new Error("opensky selected but OPENSKY_CLIENT_ID/OPENSKY_CLIENT_SECRET are not bound");
    openSky ??= createOpenSkyClient(f, { clientId: secrets.clientId(), clientSecret: secrets.clientSecret() }, now);
    const client = openSky;
    return { provider: OPENSKY_PROVIDER, live: (hexes, sleep) => client.fetchAircraft(hexes, sleep) };
  }
  const provider = (PROVIDERS as Record<string, AdsbProvider>)[key];
  if (!provider) throw new Error(`unknown ADSB_PROVIDER "${key}" (allowed: ${PROVIDER_KEYS.join(", ")})`);
  return { provider };
}

export function resetOpenSkyClient(): void {
  openSky = null;
}
