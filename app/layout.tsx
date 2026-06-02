import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { MobileNav } from '@/components/layout/MobileNav'
import { ParlayIndicator } from '@/components/layout/ParlayIndicator'
import { Footer } from '@/components/layout/Footer'
import { Toaster } from 'sonner'
import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Xepe Bet | Prode & Apuestas Mundial 2026',
  description: 'Xepe Bet: predice resultados del Mundial 2026, apuesta con creditos virtuales y compite en el ranking.',
}

export const viewport = {
  themeColor: '#0A0E22',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[var(--background)] text-[var(--foreground)]">
        <div className="relative z-10 flex-1 flex flex-col">
          {/* Cada page renderiza su Header (incluye logo XEPEBET + nav) y, si
              corresponde, envuelve su contenido en <AppShell> con LeftSidebar +
              BetslipSidebar + MiniLeaderboard. Las pages no rediseñadas todavía
              usan el layout legacy. */}
          <main className="flex-1 pb-16 md:pb-0">{children}</main>
        </div>

        <Footer />

        {/* Mobile only */}
        <ParlayIndicator />
        <MobileNav />

        <Toaster
          position="top-center"
          toastOptions={{
            style: { background: '#141A33', color: '#EAECF7', border: '1px solid #26304F' },
          }}
        />
      </body>
    </html>
  )
}
