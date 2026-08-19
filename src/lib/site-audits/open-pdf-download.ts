/** Open a signed storage URL without relying on window.open (blocked after async). */
export function openPdfDownload(url: string, filename: string) {
  const a = document.createElement('a')
  a.href = url
  a.download = filename || 'site-audit.pdf'
  a.target = '_blank'
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}
