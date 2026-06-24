import { ImageResponse } from 'next/og'

export const size = { width: 512, height: 512 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          background:   '#f97316',
          width:        '100%',
          height:       '100%',
          display:      'flex',
          alignItems:   'center',
          justifyContent: 'center',
          borderRadius: 96,
        }}
      >
        <div
          style={{
            color:      '#ffffff',
            fontSize:     180,
            fontWeight:   800,
            fontFamily:   'system-ui, sans-serif',
            letterSpacing: -8,
            lineHeight:   1,
          }}
        >
          GJ
        </div>
      </div>
    ),
    { ...size },
  )
}
