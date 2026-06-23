// Image compression + base64 helpers (skill §5). Idempotent: re-running on an
// already-small JPEG returns ~the same file. Applied at the picker AND at upload.

export async function compressImage(
  file: Blob,
  maxSide = 1280,
  quality = 0.72
): Promise<Blob> {
  const type = file.type ?? "";
  if (!type.startsWith("image/") || type === "image/svg+xml") return file;
  try {
    const bmp = await createImageBitmap(file);
    const ratio = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * ratio);
    const h = Math.round(bmp.height * ratio);
    const canvas =
      typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(w, h)
        : Object.assign(document.createElement("canvas"), { width: w, height: h });
    const ctx = (canvas as HTMLCanvasElement).getContext("2d");
    if (!ctx) {
      bmp.close?.();
      return file;
    }
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    if ((canvas as OffscreenCanvas).convertToBlob) {
      return await (canvas as OffscreenCanvas).convertToBlob({ type: "image/jpeg", quality });
    }
    return await new Promise<Blob>((resolve) => {
      (canvas as HTMLCanvasElement).toBlob((b) => resolve(b ?? file), "image/jpeg", quality);
    });
  } catch {
    return file;
  }
}

/** Blob → bare base64 (no data: prefix) — for the flow's base64ToBinary(). */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const res = String(r.result ?? "");
      const comma = res.indexOf(",");
      resolve(comma >= 0 ? res.slice(comma + 1) : res);
    };
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

/** Blob → full data: URL — for in-PDF embedding. */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

export function fileExt(f: File): string {
  const fromName = f.name.includes(".") ? f.name.split(".").pop() : "";
  if (fromName) return fromName.toLowerCase();
  const t = (f.type ?? "").split("/")[1] ?? "bin";
  return t === "jpeg" ? "jpg" : t;
}
