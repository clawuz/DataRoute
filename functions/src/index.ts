import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import * as logger from "firebase-functions/logger";
import { defineSecret, defineString } from "firebase-functions/params";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onRequest } from "firebase-functions/v2/https";
import { dayId, handleRequest } from "./personal-music.js";
import { clientIp, elevenCompose, firebaseStore, visitorId } from "./personal-music-http.js";
import { runCollect } from "./collect.js";
import { firestoreRouteCache } from "./routes.js";
import { selectProvider } from "./providers.js";
import { gcsStore } from "./storage.js";

initializeApp();

const ADSB_PROVIDER = defineString("ADSB_PROVIDER", { default: "adsbfi" });

// OpenSky secrets are only defined/bound when that provider is selected at deploy time,
// so the default (adsb.fi) deployment needs no secrets and is unchanged.
const useOpenSky = process.env.ADSB_PROVIDER === "opensky";
const OPENSKY_CLIENT_ID = useOpenSky ? defineSecret("OPENSKY_CLIENT_ID") : null;
const OPENSKY_CLIENT_SECRET = useOpenSky ? defineSecret("OPENSKY_CLIENT_SECRET") : null;

export const collect = onSchedule(
  {
    schedule: "every 1 minutes",
    region: "europe-west1",
    timeoutSeconds: 90,
    memory: "512MiB",
    maxInstances: 1,
    retryCount: 0,
    ...(OPENSKY_CLIENT_ID && OPENSKY_CLIENT_SECRET ? { secrets: [OPENSKY_CLIENT_ID, OPENSKY_CLIENT_SECRET] } : {}),
  },
  async () => {
    const now = () => Math.floor(Date.now() / 1000);
    const { provider, live } = selectProvider(
      ADSB_PROVIDER.value(),
      fetch,
      now,
      OPENSKY_CLIENT_ID && OPENSKY_CLIENT_SECRET
        ? { clientId: () => OPENSKY_CLIENT_ID.value(), clientSecret: () => OPENSKY_CLIENT_SECRET.value() }
        : null,
    );
    const result = await runCollect({
      fetch,
      now,
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      store: gcsStore(getStorage().bucket()),
      routes: firestoreRouteCache(getFirestore()),
      provider,
      live,
      log: (msg, extra) => logger.info(msg, extra),
      warn: (msg, extra) => logger.warn(msg, extra),
      clock: Date.now,
    });
    logger.info("collect finished", { result, provider: provider.name });
  },
);

// AI version of a personal piece (A World of Music, personal site). Needs the secret ELEVENLABS_API_KEY:
//   firebase functions:secrets:set ELEVENLABS_API_KEY --project omerkilavuz-9ad41
//   firebase deploy --only functions:composePersonal --project omerkilavuz-9ad41
// A plain `firebase deploy` of every function needs the secret too. See docs/personal-music.md.
const ELEVENLABS_API_KEY = defineSecret("ELEVENLABS_API_KEY");

export const composePersonal = onRequest(
  {
    region: "europe-west1",
    secrets: [ELEVENLABS_API_KEY],
    timeoutSeconds: 300,
    memory: "512MiB",
    maxInstances: 3,
    // the site, and this project's own hosting preview channels (worldofmusic-tk--<channel>-<id>.web.app)
    cors: ["https://worldofmusic-tk.web.app", "https://worldofmusic-tk.firebaseapp.com", "http://localhost:5174", /^https:\/\/worldofmusic-tk--[a-z0-9-]+\.web\.app$/],
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ status: "bad-request" });
      return;
    }
    const day = dayId(Date.now());
    const ip = clientIp(String(req.headers["x-forwarded-for"] ?? ""), req.socket?.remoteAddress ?? "unknown");
    const outcome = await handleRequest(req.body, visitorId(ip, day), {
      store: firebaseStore(getFirestore(), getStorage().bucket()),
      compose: elevenCompose(() => ELEVENLABS_API_KEY.value()),
      now: Date.now,
      log: (m) => logger.warn(m),
      enabled: process.env.PERSONAL_MUSIC_ENABLED !== "false", // kill switch: set PERSONAL_MUSIC_ENABLED=false in functions/.env and redeploy
    });
    logger.info("composePersonal", { status: outcome.status });
    res.status(outcome.status === "rate" ? 429 : outcome.status === "bad-request" ? 400 : 200).json(outcome);
  },
);
