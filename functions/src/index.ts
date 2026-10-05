import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import * as logger from "firebase-functions/logger";
import { defineString } from "firebase-functions/params";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { PROVIDERS } from "./adsb.js";
import { runCollect } from "./collect.js";
import { firestoreRouteCache } from "./routes.js";
import { gcsStore } from "./storage.js";

initializeApp();

const ADSB_PROVIDER = defineString("ADSB_PROVIDER", { default: "adsbfi" });

export const collect = onSchedule(
  {
    schedule: "every 2 minutes",
    region: "europe-west1",
    timeoutSeconds: 90,
    memory: "512MiB",
    maxInstances: 1,
    retryCount: 0,
  },
  async () => {
    const key = ADSB_PROVIDER.value() as keyof typeof PROVIDERS;
    const provider = PROVIDERS[key];
    if (!provider) throw new Error(`unknown ADSB_PROVIDER "${key}"`);
    const result = await runCollect({
      fetch,
      now: () => Math.floor(Date.now() / 1000),
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      store: gcsStore(getStorage().bucket()),
      routes: firestoreRouteCache(getFirestore()),
      provider,
      log: (msg, extra) => logger.info(msg, extra),
      warn: (msg, extra) => logger.warn(msg, extra),
      clock: Date.now,
    });
    logger.info("collect finished", { result, provider: provider.name });
  },
);
