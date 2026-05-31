/**
 * Compresse une image côté navigateur avant upload Supabase.
 *
 * Problèmes mobile connus :
 * - iOS Safari < 17.2 : createImageBitmap() peut ne jamais résoudre ni rejeter
 *   (hang silencieux). On le race contre un timeout de 3 s.
 * - canvas.toBlob() peut aussi hanger sur petits appareils. Timeout de 8 s.
 * - Si tout échoue, on renvoie le fichier original (Supabase l'uploadera tel quel).
 */
export async function compressImage(
  file: File,
  opts: { maxDim?: number; quality?: number } = {}
): Promise<File> {
  const { maxDim = 1600, quality = 0.82 } = opts

  // Petit fichier standard → pas besoin de compresser
  if (file.size < 600 * 1024 && /image\/(jpeg|png|webp)/i.test(file.type)) {
    return file
  }

  // ── Décodage ─────────────────────────────────────────────────────────────
  // Priorité 1 : createImageBitmap avec imageOrientation (corrige l'EXIF).
  //   Race contre 3 s pour ne pas bloquer si le browser hang (iOS Safari bug).
  // Priorité 2 : <img> element — universel, mais sans correction EXIF canvas.
  let source: ImageBitmap | HTMLImageElement
  let srcW: number
  let srcH: number

  try {
    const bitmap = await Promise.race([
      createImageBitmap(file, { imageOrientation: 'from-image' }),
      rejectAfter(3000),
    ])
    source = bitmap; srcW = bitmap.width; srcH = bitmap.height
  } catch {
    const fallback = await decodeViaImg(file).catch(() => null)
    if (!fallback) return file
    source = fallback.img; srcW = fallback.w; srcH = fallback.h
  }

  // ── Redimensionnement ────────────────────────────────────────────────────
  const scale = Math.min(1, maxDim / Math.max(srcW, srcH))
  const w = Math.round(srcW * scale)
  const h = Math.round(srcH * scale)

  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) { closeBitmap(source); return file }
  ctx.drawImage(source, 0, 0, w, h)
  closeBitmap(source)

  // ── Encodage JPEG ────────────────────────────────────────────────────────
  // Race contre 8 s pour éviter un hang de toBlob sur petits appareils.
  const blob = await Promise.race([
    new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', quality)),
    resolveAfter<Blob | null>(8000, null),
  ])
  if (!blob) return file

  if (blob.size >= file.size) return file

  const baseName = file.name.replace(/\.[^.]+$/, '') || 'photo'
  return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: Date.now() })
}

// ── Helpers ───────────────────────────────────────────────────────────────

function rejectAfter(ms: number): Promise<never> {
  return new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))
}

function resolveAfter<T>(ms: number, val: T): Promise<T> {
  return new Promise(res => setTimeout(() => res(val), ms))
}

function closeBitmap(src: ImageBitmap | HTMLImageElement) {
  if ('close' in src) src.close()
}

/** Décode un fichier image via un élément <img> — fallback universel. */
function decodeViaImg(
  file: File
): Promise<{ img: HTMLImageElement; w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const w = img.naturalWidth
      const h = img.naturalHeight
      URL.revokeObjectURL(url)
      if (!w || !h) { reject(new Error('empty image')); return }
      resolve({ img, w, h })
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode failed')) }
    img.src = url
  })
}
