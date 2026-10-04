import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Fontes no repositório, não `next/font/google`: o loader do Google baixa os
// arquivos a cada build, e um download falho derruba o `next build` inteiro
// (aconteceu no CI da main, no merge do #128). Subset latin do Google Fonts,
// via @fontsource — licença em src/fonts/OFL-*.txt.
//
// Direção Órbita (docs/design/orbita-v2): Geist no texto, Geist Mono em
// rótulos e números, Instrument Serif nos títulos.
const geist = localFont({
  variable: "--font-geist",
  display: "swap",
  src: [
    { path: "../fonts/geist-sans-300.woff2", weight: "300", style: "normal" },
    { path: "../fonts/geist-sans-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/geist-sans-500.woff2", weight: "500", style: "normal" },
    { path: "../fonts/geist-sans-600.woff2", weight: "600", style: "normal" },
  ],
});

const geistMono = localFont({
  variable: "--font-geist-mono",
  display: "swap",
  src: [
    { path: "../fonts/geist-mono-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/geist-mono-500.woff2", weight: "500", style: "normal" },
  ],
});

const instrumentSerif = localFont({
  variable: "--font-instrument-serif",
  display: "swap",
  src: [
    { path: "../fonts/instrument-serif-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/instrument-serif-400-italic.woff2", weight: "400", style: "italic" },
  ],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://useorbien.com"),
  title: {
    template: "%s — Orbien",
    default: "Orbien — Gestão que serve. Igreja que cresce.",
  },
  description:
    "Plataforma de gestão para igrejas de pequeno e médio porte. App com identidade da sua igreja sem exigir CNPJ.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="pt-BR"
      className={`${geist.variable} ${geistMono.variable} ${instrumentSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
