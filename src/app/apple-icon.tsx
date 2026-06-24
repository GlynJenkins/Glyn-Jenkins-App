import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
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
          borderRadius: 36,
        }}
      >
        <div
          style={{
            color:      '#ffffff',
            fontSize:     64,
            fontWeight:   800,
            fontFamily:   'system-ui, sans-serif',
            letterSpacing: -3,
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
