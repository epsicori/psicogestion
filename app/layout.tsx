import type { Metadata, Viewport } from 'next';
import { DM_Serif_Display, Geist, Geist_Mono } from 'next/font/google';

import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

// Serif solo para titulares y cifras: es la voz «de calma» del sistema de diseño.
const dmSerif = DM_Serif_Display({
  variable: '--font-dm-serif',
  subsets: ['latin'],
  weight: '400',
});

export const metadata: Metadata = {
  title: 'Psicogestión · Tu práctica, en calma',
  description: 'Gestión clínica y facturación para consultas de psicología',
};

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#f7f5ef',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} ${dmSerif.variable} h-full antialiased`}
    >
      <body className="bg-background text-foreground flex min-h-full flex-col">{children}</body>
    </html>
  );
}
