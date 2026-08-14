/** Decode a browser canvas data URL (PNG) to a Buffer. */
export function decodePngDataUrl(dataUrl: string): Buffer | null {
  const match = /^data:image\/png;base64,(.+)$/i.exec(dataUrl.trim())
  if (!match) return null
  try {
    return Buffer.from(match[1], 'base64')
  } catch {
    return null
  }
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Could not read signature'))
    reader.readAsDataURL(blob)
  })
}

export const ROLE_LABELS: Record<string, string> = {
  foreman:           'Foreman',
  bricklayer:        'Bricklayer',
  labourer:          'Labourer',
  apprentice:        'Apprentice',
  management:        'Management',
  contracts_manager: 'Contracts Manager',
  site_supervisor:   'Site Supervisor',
  jetwasher:         'Jetwasher',
  admin:             'Admin',
}

export function formatWorkerRole(role: string | null | undefined): string {
  if (!role) return '—'
  return ROLE_LABELS[role] ?? role.replace(/_/g, ' ')
}
