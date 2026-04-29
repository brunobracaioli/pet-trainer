import type { ReactNode } from 'react'

export const metadata = {
  title: 'pet-trainer',
  description: 'Terminal Tamagotchi that gamifies learning Claude Code',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#0b0d10', color: '#e5e7eb' }}>{children}</body>
    </html>
  )
}
