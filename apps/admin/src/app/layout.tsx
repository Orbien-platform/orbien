import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { AuthProvider } from "@/contexts/AuthContext";

// Fontes no repositório, não `next/font/google`: o loader do Google baixa os
// arquivos a cada build, e um download falho derruba o `next build` inteiro
// (aconteceu no CI da main, no merge do #128). Subset latin do Google Fonts,
// via @fontsource — licença em src/fonts/OFL-*.txt.
const dmSans = localFont({
  variable: "--font-dm-sans",
  src: [
    { path: "../fonts/dm-sans-300.woff2", weight: "300", style: "normal" },
    { path: "../fonts/dm-sans-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/dm-sans-500.woff2", weight: "500", style: "normal" },
  ],
});

const dmMono = localFont({
  variable: "--font-dm-mono",
  src: [
    { path: "../fonts/dm-mono-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/dm-mono-500.woff2", weight: "500", style: "normal" },
  ],
});

export const metadata: Metadata = {
  title: "Orbien — Plataforma",
  description: "Console de administração da plataforma Orbien",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${dmSans.variable} ${dmMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
