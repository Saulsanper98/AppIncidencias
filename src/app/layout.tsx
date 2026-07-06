import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { RegisterServiceWorker } from "@/components/register-service-worker";
import { ChunkErrorRecovery } from "@/components/chunk-error-recovery";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
  adjustFontFallback: true,
  fallback: ["system-ui", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
  adjustFontFallback: true,
  fallback: ["ui-monospace", "Cascadia Code", "Consolas", "monospace"],
});

export const metadata: Metadata = {
  title: "CCMGC Ticketing",
  description: "Sistema integral de gestión de incidencias de movilidad",
  appleWebApp: {
    capable: true,
    title: "CCMGC",
  },
};

export const viewport: Viewport = {
  themeColor: "#2563eb",
  // viewportFit cover deja que la app ocupe el "safe area" del iPhone con
  // notch. initialScale 1 evita el "scroll to fit" inicial. NO bloqueamos
  // el zoom (userScalable / maximumScale) por accesibilidad: usuarios con
  // baja vision tienen que poder hacer pinch-to-zoom. Para evitar el zoom
  // involuntario de iOS al enfocar inputs, los inputs llevan font-size
  // >= 16px en movil via globals.css.
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <RegisterServiceWorker />
        <ChunkErrorRecovery />
        {children}
      </body>
    </html>
  );
}
