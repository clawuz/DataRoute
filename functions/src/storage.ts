import type { getStorage } from "firebase-admin/storage";

type Bucket = ReturnType<ReturnType<typeof getStorage>["bucket"]>;

export interface JsonStore {
  read<T>(path: string): Promise<{ data: T; generation: number } | null>;
  write(path: string, data: unknown, opts?: { ifGeneration?: number; cacheControl?: string }): Promise<void>;
}

export class PreconditionFailed extends Error {}

const code = (e: unknown) => (e as { code?: number }).code;

export function gcsStore(bucket: Bucket): JsonStore {
  return {
    async read<T>(path: string) {
      try {
        const [meta] = await bucket.file(path).getMetadata();
        const generation = Number(meta.generation);
        const [buf] = await bucket.file(path, { generation }).download();
        return { data: JSON.parse(buf.toString("utf8")) as T, generation };
      } catch (e) {
        if (code(e) === 404) return null;
        throw e;
      }
    },
    async write(path, data, opts = {}) {
      try {
        await bucket.file(path).save(JSON.stringify(data), {
          gzip: true,
          contentType: "application/json",
          metadata: { cacheControl: opts.cacheControl ?? "no-store" },
          ...(opts.ifGeneration !== undefined
            ? { preconditionOpts: { ifGenerationMatch: opts.ifGeneration } }
            : {}),
        });
      } catch (e) {
        if (code(e) === 412) throw new PreconditionFailed(path);
        throw e;
      }
    },
  };
}
