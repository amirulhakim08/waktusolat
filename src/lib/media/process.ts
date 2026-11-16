import "server-only";
import { createHash } from "node:crypto";
import sharp, { type Metadata } from "sharp";
import { detectFileType, mp4VideoCodec } from "./detect";

export interface ProcessedMedia {
  bytes: Uint8Array;
  replaced: boolean; // true when an optimised rendition replaces the upload
  mime: string;
  width: number | null;
  height: number | null;
  sha256: string;
  metadata: Record<string, unknown>;
}

export class MediaValidationError extends Error {}

/** Longest edges for TV renditions: sharp on 1080p/1440p, readable on 4K. */
const MAX_W = 2560;
const MAX_H = 1440;

/**
 * Validates uploaded bytes and, for oversized images, produces a TV-sized
 * rendition with high quality settings so poster text stays crisp.
 */
export async function processUpload(bytes: Uint8Array, declaredMime: string): Promise<ProcessedMedia> {
  const detected = detectFileType(bytes);
  if (!detected || detected !== declaredMime) {
    throw new MediaValidationError("Kandungan fail tidak sepadan dengan formatnya.");
  }
  const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

  if (detected === "video/mp4") {
    const codec = mp4VideoCodec(bytes);
    if (codec !== "h264") {
      throw new MediaValidationError(
        codec === "hevc"
          ? "Video HEVC/H.265 tidak disokong oleh kebanyakan TV. Sila tukar kepada MP4 H.264."
          : "Codec video tidak dikenali. Sila gunakan MP4 H.264.",
      );
    }
    return { bytes, replaced: false, mime: detected, width: null, height: null, sha256: sha(bytes), metadata: { codec } };
  }

  let meta: Metadata;
  try {
    meta = await sharp(bytes, { limitInputPixels: 50_000_000 }).metadata();
  } catch {
    throw new MediaValidationError("Gambar rosak atau tidak dapat dibaca.");
  }
  const width = meta.width ?? null;
  const height = meta.height ?? null;
  if (!width || !height) throw new MediaValidationError("Gambar tidak mempunyai dimensi yang sah.");

  const needsResize = width > MAX_W || height > MAX_H;
  const needsRotate = (meta.orientation ?? 1) > 1;
  if (!needsResize && !needsRotate) {
    return { bytes, replaced: false, mime: detected, width, height, sha256: sha(bytes), metadata: { format: meta.format } };
  }

  let pipeline = sharp(bytes).rotate().resize({ width: MAX_W, height: MAX_H, fit: "inside", withoutEnlargement: true });
  if (detected === "image/jpeg") pipeline = pipeline.jpeg({ quality: 90, mozjpeg: true, chromaSubsampling: "4:4:4" });
  else if (detected === "image/webp") pipeline = pipeline.webp({ quality: 90, smartSubsample: true });
  else pipeline = pipeline.png({ compressionLevel: 9, adaptiveFiltering: true });
  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
  const out = new Uint8Array(data);
  // Keep the original if the rendition is not actually smaller (unless rotation was required).
  if (out.byteLength >= bytes.byteLength && !needsRotate) {
    return { bytes, replaced: false, mime: detected, width, height, sha256: sha(bytes), metadata: { format: meta.format } };
  }
  return {
    bytes: out,
    replaced: true,
    mime: detected,
    width: info.width,
    height: info.height,
    sha256: sha(out),
    metadata: { format: meta.format, original: { width, height, size: bytes.byteLength } },
  };
}
