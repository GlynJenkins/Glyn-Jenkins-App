import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name:             'Glyn Jenkins LTD — Workforce Portal',
    short_name:       'GJ Portal',
    description:      'Workforce management for Glyn Jenkins LTD bricklaying company.',
    start_url:        '/',
    display:          'standalone',
    background_color: '#0f172a',
    theme_color:      '#f97316',
    orientation:      'portrait-primary',
    icons: [
      {
        src:     '/icon',
        sizes:   '512x512',
        type:    'image/png',
        purpose: 'any',
      },
      {
        src:     '/apple-icon',
        sizes:   '180x180',
        type:    'image/png',
        purpose: 'any',
      },
      {
        src:     '/icon',
        sizes:   '512x512',
        type:    'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
