import { readFile } from 'fs/promises'
import path from 'path'

export type GuideId = 'foreman' | 'management'

const GUIDE_FILES: Record<GuideId, string> = {
  foreman:    'foreman-guide.md',
  management: 'management-guide.md',
}

export const GUIDE_PDF_HREF: Record<GuideId, string> = {
  foreman:    '/guides/foreman-guide.pdf',
  management: '/guides/management-guide.pdf',
}

export async function loadGuideMarkdown(id: GuideId): Promise<string> {
  const filePath = path.join(process.cwd(), 'src/content/guides', GUIDE_FILES[id])
  return readFile(filePath, 'utf8')
}
