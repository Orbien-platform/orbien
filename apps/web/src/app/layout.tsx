import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { AuthProvider } from "@/contexts/AuthContext";
import { TooltipProvider } from "@/components/ui/tooltip";

// Fontes no repositório, não `next/font/google`: o loader do Google baixa os
// arquivos a cada build, e um download falho derruba o `next build` inteiro
// (aconteceu no CI da main, no merge do #128). Subset latin do Google Fonts,
// via @fontsource — licença em src/fonts/OFL-*.txt.
//
// Direção Órbita (docs/design/orbita-v2): Geist na interface, Geist Mono em
// números e rótulos, Instrument Serif nos títulos de página.
const geist = localFont({
  variable: "--font-geist",
  src: [
    { path: "../fonts/geist-sans-300.woff2", weight: "300", style: "normal" },
    { path: "../fonts/geist-sans-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/geist-sans-500.woff2", weight: "500", style: "normal" },
    { path: "../fonts/geist-sans-600.woff2", weight: "600", style: "normal" },
  ],
});

const geistMono = localFont({
  variable: "--font-geist-mono",
  src: [
    { path: "../fonts/geist-mono-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/geist-mono-500.woff2", weight: "500", style: "normal" },
  ],
});

const instrumentSerif = localFont({
  variable: "--font-instrument-serif",
  src: [
    { path: "../fonts/instrument-serif-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/instrument-serif-400-italic.woff2", weight: "400", style: "italic" },
  ],
});

export const metadata: Metadata = {
  title: "Orbien",
  description: "Plataforma de gestão para igrejas",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${geist.variable} ${geistMono.variable} ${instrumentSerif.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <AuthProvider>
            <TooltipProvider>{children}</TooltipProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
