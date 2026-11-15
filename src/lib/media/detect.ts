/**
 * Content sniffing: the declared MIME type / extension is never trusted.
 */
export type DetectedType = "image/jpeg" | "image/png" | "image/webp" | "video/mp4" | "application/pdf";

const ascii = (b: Uint8Array, start: number, len: number) =>
  String.fromCharCode(...b.subarray(start, start + len));

export function detectFileType(bytes: Uint8Array): DetectedType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => bytes[i] === v)) return "image/png";
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return "image/webp";
  if (bytes.length >= 5 && ascii(bytes, 0, 5) === "%PDF-") return "application/pdf";
  if (bytes.length >= 12 && ascii(bytes, 4, 4) === "ftyp") {
    const brand = ascii(bytes, 8, 4);
    if (["isom", "iso2", "iso4", "iso5", "iso6", "mp41", "mp42", "avc1", "M4V ", "MSNV", "dash", "mmp4"].includes(brand)) return "video/mp4";
  }
  return null;
}

function indexOf(hay: Uint8Array, needle: string): number {
  const n = Array.from(needle, (c) => c.charCodeAt(0));
  outer: for (let i = 0; i <= hay.length - n.length; i++) {
    for (let j = 0; j < n.length; j++) if (hay[i + j] !== n[j]) continue outer;
    return i;
  }
  return -1;
}

/**
 * MP4 codec check. Browsers on TVs reliably decode H.264 (avc1/avcC);
 * HEVC (hvc1/hev1) and others are rejected.
 */
export function mp4VideoCodec(bytes: Uint8Array): "h264" | "hevc" | "unknown" {
  if (indexOf(bytes, "avcC") >= 0 || indexOf(bytes, "avc1") >= 0) return "h264";
  if (indexOf(bytes, "hvcC") >= 0 || indexOf(bytes, "hvc1") >= 0 || indexOf(bytes, "hev1") >= 0) return "hevc";
  return "unknown";
}

export const EXT_FOR: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "application/pdf": "pdf",
};
