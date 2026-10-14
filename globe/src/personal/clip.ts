/** The best container the browser can record: mp4 where it exists (iOS, recent Chrome), else webm. */
export function pickMime(isSupported: (m: string) => boolean = (m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)): string | null {
  const list = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  return list.find(isSupported) ?? null;
}

export const extOf = (mime: string): string => (mime.startsWith("video/mp4") ? "mp4" : "webm");

/** Records `stream` for `ms` milliseconds. */
export function recordClip(stream: MediaStream, ms: number, mime: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000 });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    rec.onerror = () => reject(new Error("recording failed"));
    rec.onstop = () => resolve(new Blob(chunks, { type: mime.split(";")[0] }));
    rec.start(250);
    setTimeout(() => rec.state !== "inactive" && rec.stop(), ms);
  });
}
