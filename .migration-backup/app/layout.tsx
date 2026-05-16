import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

const inter = Inter({ 
  subsets: ["latin"],
  variable: '--font-inter'
})

export const metadata: Metadata = {
  title: 'Nexus - Plans, Perfectly Aligned',
  description: 'The AI assistant that finds the perfect time and place for everyone. Discover your Golden Window.',
  generator: 'v0.app',
}

export const viewport: Viewport = {
  themeColor: '#0f1729',
  colorScheme: 'dark',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark bg-background">
      <body className={`${inter.variable} font-sans antialiased min-h-screen bg-background`}>
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
