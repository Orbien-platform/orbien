"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { useAuth } from "@/hooks/useAuth";
import { getAccessToken, clearTokens } from "@/lib/auth";

export default function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  // O `proxy.ts` já barra quem chega sem cookie. Isto cobre o outro caminho:
  // cookie presente com token ilegível ou sem `platform_support`. Nesse caso o
  // storage é limpo aqui — deixar um token de outro papel guardado faria a
  // próxima visita repetir o mesmo redirect sem nunca resolver.
  useEffect(() => {
    if (isLoading || isAuthenticated) return;
    if (getAccessToken()) clearTokens();
    router.replace("/login");
  }, [isLoading, isAuthenticated, router]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--surface-parchment)]">
        <Loader2 size={20} className="animate-spin text-stone" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--surface-parchment)]">
      <div className="hidden lg:flex lg:flex-shrink-0">
        <Sidebar />
      </div>
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
