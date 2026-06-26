export const MAX_QA_INSPECTION_PHOTOS = 20

export type StoredInspectionPhoto = {
  path: string
  mime: string
}

export function photoExtension(mime: string): 'png' | 'jpg' {
  return mime.includes('png') ? 'png' : 'jpg'
}

export function storagePathsFromFormData(formData: unknown): string[] {
  const data = formData as {
    firesock_photo_path?: string | null
    inspection_photo_paths?: string[] | null
  } | null

  const paths: string[] = []
  if (data?.firesock_photo_path) paths.push(data.firesock_photo_path)
  if (data?.inspection_photo_paths?.length) paths.push(...data.inspection_photo_paths)
  return paths
}
