import { imageSize } from "image-size";
import { HTTPException } from "hono/http-exception";
const maximum = 5 * 1024 * 1024;
function hasPayload(bytes: Uint8Array, png: boolean) {
  if (!png) {
    // A JPEG must have a start-of-scan marker in addition to a supported frame.
    for (let i = 2; i < bytes.length - 5; ) {
      if (bytes[i++] !== 255) return false;
      while (bytes[i] === 255) i++;
      const marker = bytes[i++];
      const length = (bytes[i] << 8) | bytes[i + 1];
      if (length < 2 || i + length >= bytes.length) return false;
      if (marker === 218) return i + length < bytes.length - 2;
      i += length;
    }
    return false;
  }
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let payload = false;
  for (let i = 8; i + 12 <= bytes.length; ) {
    const length = data.getUint32(i),
      type = data.getUint32(i + 4);
    if (i + length + 12 > bytes.length) return false;
    if (i === 8 && (type !== 0x49484452 || length !== 13)) return false;
    if (type === 0x49444154 && length > 0) payload = true;
    i += length + 12;
    if (type === 0x49454e44)
      return payload && length === 0 && i === bytes.length;
  }
  return false;
}
export async function readGraphic(req: Request) {
  const mime = req.headers.get("content-type");
  if (mime !== "image/png" && mime !== "image/jpeg")
    throw new HTTPException(415, { message: "Choose a PNG or JPEG image." });
  const reader = req.body?.getReader();
  if (!reader) throw new HTTPException(400, { message: "The image is empty." });
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maximum) {
      await reader.cancel();
      throw new HTTPException(413, {
        message: "The maximum image size is 5 MB.",
      });
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    const { width, height, type } = imageSize(bytes);
    const png = mime === "image/png";
    const tail = png
      ? [0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]
      : [255, 217];
    if (
      type !== (png ? "png" : "jpg") ||
      !hasPayload(bytes, png) ||
      !tail.every((b, i) => bytes[size - tail.length + i] === b) ||
      !width ||
      !height ||
      width > 8192 ||
      height > 8192 ||
      width * height > 25000000
    )
      throw new Error();
    return { bytes, width, height, mime };
  } catch {
    throw new HTTPException(422, {
      message:
        "Invalid or truncated graphic. Use PNG or JPEG up to 8,192 px per side and 25 megapixels.",
    });
  }
}
