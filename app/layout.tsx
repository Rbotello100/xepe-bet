import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { MobileNav } from '@/components/layout/MobileNav'
import { ParlayIndicator } from '@/components/layout/ParlayIndicator'
import { BetslipSidebar } from '@/components/layout/BetslipSidebar'
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
  title: 'Mundial 2026 | Prode & Apuestas',
  description: 'Predice resultados, apuesta con creditos y compite en el ranking del Mundial 2026',
}

export const viewport = {
  themeColor: '#0A0E1A',
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
        <div className="relative z-10 flex-1 flex">
          {/* Main content */}
          <main className="flex-1 pb-16 md:pb-0">
            {children}
          </main>

          {/* Desktop betslip sidebar */}
          <aside className="hidden lg:block w-80 flex-shrink-0 border-l border-[var(--card-border)] p-4">
            <BetslipSidebar />
          </aside>
        </div>

        <Footer />

        {/* Mobile only */}
        <ParlayIndicator />
        <MobileNav />

        <Toaster
          position="top-center"
          toastOptions={{
            style: { background: '#131829', color: '#E8EEFC', border: '1px solid #1F2740' },
          }}
        />
      </body>
    </html>
  )
}
