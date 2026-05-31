/**
 * Compresse une image côté navigateur avant upload Supabase.
 *
 * iPhone & Android prennent des JPEG de 4–12 MB. Supabase Storage accepte
 * jusqu'à 50 MB par défaut mais le réseau mobile + le rendu canvas iOS
 * échouent souvent sur ces tailles → l'utilisateur voit "Erreur upload photo".
 *
 * On redimensionne à 1600 px max sur le grand côté, ré-encode en JPEG 0.82,
 * et conserve l'orientation EXIF (le navigateur l'applique automatiquement
 * via createImageBitmap avec `imageOrientation: 'from-image'`).
 */
export async function compressImage(
  file: File,
  opts: { maxDim?: number; quality?: number } = {}
): Promise<File> {
  const { maxDim = 1600, quality = 0.82 } = opts

  // Si déjà petit ET pas HEIC : on garde tel quel
  if (file.size < 600 * 1024 && /image\/(jpeg|png|webp)/i.test(file.type)) {
    return file
  }

  // createImageBitmap gère HEIC (Safari), JPEG, PNG, WEBP et applique l'EXIF.
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    // Fallback : si createImageBitmap échoue (ex: HEIC sur Chrome), renvoyer
    // l'original — Supabase tentera l'upload, et l'utilisateur saura.
    return file
  }

  const { width, height } = bitmap
  const scale = Math.min(1, maxDim / Math.max(width, height))
  const w = Math.round(width * scale)
  const h = Math.round(height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) { bitmap.close?.(); return file }
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close?.()

  const blob = await new Promise<Blob | null>(resolve =>
    canvas.toBlob(resolve, 'image/jpeg', quality)
  )
  if (!blob) return file

  // Si la compression n'a rien gagné (rare, image déjà optimisée), garder l'original
  if (blob.size >= file.size) return file

  const baseName = file.name.replace(/\.[^.]+$/, '') || 'photo'
  return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: Date.now() })
}
