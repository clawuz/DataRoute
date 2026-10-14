import { createHash } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import type { getStorage } from "firebase-admin/storage";
import type { PlanChunk, Store } from "./personal-music.js";

type Bucket = ReturnType<ReturnType<typeof getStorage>["bucket"]>;

const MODEL = "music_v2_5";
const API = "https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128";

/** Day and visitor counters in Firestore, finished tracks in the bucket under public/personal/. */
export function firebaseStore(db: Firestore, bucket: Bucket): Store {
  const path = (key: string) => `public/personal/${key}.mp3`;
  const urlOf = (key: string) => `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path(key))}?alt=media`;
  return {
    async find(key) {
      const [exists] = await bucket.file(path(key)).exists();
      return exists ? urlOf(key) : null;
    },
    async claim(day, visitor, caps) {
      const dayRef = db.collection("personalMusicDaily").doc(day);
      const visRef = db.collection("personalMusicVisitors").doc(`${day}_${visitor}`);
      return db.runTransaction(async (tx) => {
        const [d, v] = await Promise.all([tx.get(dayRef), tx.get(visRef)]);
        const dc = (d.data()?.count as number | undefined) ?? 0;
        const vc = (v.data()?.count as number | undefined) ?? 0;
        if (dc >= caps.daily) return "cap" as const;
        if (vc >= caps.visitor) return "limit" as const;
        tx.set(dayRef, { count: dc + 1 }, { merge: true });
        tx.set(visRef, { count: vc + 1 }, { merge: true });
        return "ok" as const;
      });
    },
    async release(day, visitor) {
      const dayRef = db.collection("personalMusicDaily").doc(day);
      const visRef = db.collection("personalMusicVisitors").doc(`${day}_${visitor}`);
      await db.runTransaction(async (tx) => {
        const [d, v] = await Promise.all([tx.get(dayRef), tx.get(visRef)]);
        tx.set(dayRef, { count: Math.max(0, ((d.data()?.count as number | undefined) ?? 1) - 1) }, { merge: true });
        tx.set(visRef, { count: Math.max(0, ((v.data()?.count as number | undefined) ?? 1) - 1) }, { merge: true });
      });
    },
    async save(key, mp3) {
      await bucket.file(path(key)).save(Buffer.from(mp3), {
        resumable: false,
        contentType: "audio/mpeg",
        metadata: { cacheControl: "public, max-age=31536000, immutable" },
      });
      return urlOf(key);
    },
  };
}

/** ElevenLabs music composition (uses credits). Throws on any non-2xx. */
export function elevenCompose(apiKey: () => string, fetchImpl: typeof fetch = fetch) {
  return async (plan: { chunks: PlanChunk[] }): Promise<Uint8Array> => {
    const res = await fetchImpl(API, {
      method: "POST",
      headers: { "Content-Type": "application/json", "xi-api-key": apiKey() },
      body: JSON.stringify({ composition_plan: { chunks: plan.chunks }, model_id: MODEL }),
    });
    if (!res.ok) throw new Error(`elevenlabs ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  };
}

/** A visitor is the IP address, hashed with the day: the counters hold no addresses and reset every day. */
export const visitorId = (ip: string, day: string): string => createHash("sha256").update(`${day}|${ip}`).digest("hex").slice(0, 24);
