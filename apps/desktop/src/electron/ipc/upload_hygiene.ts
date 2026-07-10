import fs from 'fs'
import path from 'path'

export const UPLOADS_DIR_NAME = 'uploads'
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024

const MAX_UPLOAD_NAME_LENGTH = 120

function cleanNamePart(value: string, fallback: string): string {
  const cleaned = value
    .normalize('NFKC')
    .replace(/[^\w.\- ]+/g, '_')
    .replace(/^\.+/, '')
    .replace(/\s+/g, ' ')
    .trim()

  return cleaned || fallback
}

export function sanitizeUploadName(rawName: string): string {
  const basename = path.basename(rawName || 'file')
  const rawExt = path.extname(basename)
  const rawBase = path.basename(basename, rawExt)
  const extBody = rawExt
    .slice(1)
    .toLowerCase()
    .replace(/[^\w-]+/g, '_')
    .slice(0, 15)
  const ext = extBody ? `.${extBody}` : ''
  const base = cleanNamePart(rawBase, 'file').slice(0, MAX_UPLOAD_NAME_LENGTH)
  return `${base}${ext}`
}

/** İsim çakışmasında "ad-1.ext", "ad-2.ext" … üretir. */
export function uniqueUploadName(dir: string, rawName: string): string {
  const name = sanitizeUploadName(rawName)
  const ext = path.extname(name)
  const base = path.basename(name, ext) || 'file'
  let candidate = `${base}${ext}`
  let i = 1
  while (fs.existsSync(path.join(dir, candidate))) candidate = `${base}-${i++}${ext}`
  return candidate
}

export function uploadRelPath(name: string): string {
  return path.posix.join(UPLOADS_DIR_NAME, sanitizeUploadName(name))
}
