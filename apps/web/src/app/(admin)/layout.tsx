import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { SupportSessionBanner } from "@/components/layout/SupportSessionBanner";
import { ChurchIdentityProvider } from "@/contexts/ChurchIdentityContext";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ChurchIdentityProvider>
      <div className="flex h-screen overflow-hidden bg-[var(--surface-parchment)]">
        {/* Sidebar — hidden on mobile, fixed on desktop */}
        <div className="hidden lg:flex lg:flex-shrink-0">
          <Sidebar />
        </div>

        {/* Main area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <SupportSessionBanner />
          <Header />
          <main className="relative flex-1 overflow-y-auto">
            {/* Anéis da Órbita, atrás do conteúdo */}
            <div aria-hidden="true" className="orbit-bg">
              <i />
              <i />
              <i />
            </div>
            <div className="relative p-6">{children}</div>
          </main>
        </div>
      </div>
    </ChurchIdentityProvider>
  );
}
