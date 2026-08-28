import type { Metadata, Viewport } from 'next'
import { Toaster } from 'sonner'
import { Providers } from '@/components/providers'
import './globals.css'

export const metadata: Metadata = {
  title: 'Nexus - Plans, Perfectly Aligned',
  description: 'The AI assistant that finds the perfect time and place for everyone. Discover your Golden Window.',
  generator: 'Nexus',
}

export const viewport: Viewport = {
  themeColor: '#0f1729',
  colorScheme: 'dark light',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased min-h-screen bg-background">
        <Providers>
          {children}
          <Toaster position="bottom-center" toastOptions={{ style: { marginBottom: '72px' } }} />
        </Providers>
      </body>
    </html>
  )
}
