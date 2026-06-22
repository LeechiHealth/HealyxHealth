// Prepares a user file for upload to the AI.
// Images (incl. iPhone HEIC + huge phone photos) are re-encoded to a reasonably
// sized JPEG in the browser so the vision model can read them. PDFs/text pass through.

export interface PreparedFile {
  base64: string
  mimeType: string
  name: string
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve((r.result as string).split(",")[1])
    r.onerror = reject
    r.readAsDataURL(file)
  })
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = reject
    r.readAsDataURL(file)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

export async function prepareFile(file: File): Promise<PreparedFile> {
  // Non-images pass through unchanged (PDF, text)
  if (!file.type.startsWith("image/")) {
    return { base64: await fileToBase64(file), mimeType: file.type, name: file.name }
  }

  // Images: decode (Safari decodes HEIC) and re-encode to JPEG, downscaled.
  try {
    const dataUrl = await readAsDataURL(file)
    const img = await loadImage(dataUrl)
    const maxDim = 1568
    let w = img.naturalWidth || img.width
    let h = img.naturalHeight || img.height
    if (!w || !h) throw new Error("no dimensions")
    if (w > maxDim || h > maxDim) {
      const scale = maxDim / Math.max(w, h)
      w = Math.round(w * scale)
      h = Math.round(h * scale)
    }
    const canvas = document.createElement("canvas")
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("no canvas context")
    ctx.drawImage(img, 0, 0, w, h)
    const jpeg = canvas.toDataURL("image/jpeg", 0.85)
    const base64 = jpeg.split(",")[1]
    if (!base64) throw new Error("encode failed")
    return { base64, mimeType: "image/jpeg", name: file.name.replace(/\.\w+$/, "") + ".jpg" }
  } catch {
    // Fallback: send the original bytes
    return { base64: await fileToBase64(file), mimeType: file.type, name: file.name }
  }
}
