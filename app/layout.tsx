import type { Metadata, Viewport } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Cristal Sagrado · Registro',
  description: 'Registro privado de consultas, ventas y cobros',
  manifest: '/manifest.webmanifest',
  robots: { index: false, follow: false },
  icons: {icon:'/favicon.png',apple:'/apple-touch-icon.png'},
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#171016' };
export default function RootLayout({children}: {children: React.ReactNode}) {
  return <html lang="es-UY"><body>{children}</body></html>;
}
