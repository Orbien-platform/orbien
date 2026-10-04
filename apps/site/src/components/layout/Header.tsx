import Link from "next/link";
import { Menu } from "lucide-react";
import { NavDropdown } from "@/components/layout/NavDropdown";

const NAV_LINKS = [
  { href: "/precos", label: "Preços" },
  { href: "/sem-cnpj", label: "Sem CNPJ" },
  { href: "/sobre", label: "Sobre" },
] as const;

function BrandMark() {
  return (
    <span
      className="w-[22px] h-[22px] relative flex-shrink-0"
      style={{ color: "var(--ink)" }}
    >
      {/* Marca da Órbita: anel com o satélite teal (`OrbLogo` da v2). */}
      <svg viewBox="0 0 24 24" fill="none" className="w-full h-full">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="19" cy="9" r="2.2" fill="var(--color-teal)" />
      </svg>
    </span>
  );
}

export function Header() {
  return (
    <header
      className="sticky top-0 z-50 w-full border-b"
      style={{
        background: "var(--nav-bg)",
        backdropFilter: "saturate(160%) blur(14px)",
        WebkitBackdropFilter: "saturate(160%) blur(14px)",
        borderColor: "var(--border)",
      }}
    >
      <div className="mx-auto flex h-16 max-w-[1180px] items-center justify-between px-6">
        {/* Brand */}
        <Link
          href="/"
          className="flex items-center gap-2 font-sans text-[17px] font-medium tracking-[-0.02em]"
          style={{ color: "var(--ink)" }}
        >
          <BrandMark />
          Orbien
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-7" aria-label="Principal">
          <NavDropdown />
          {NAV_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="text-sm font-normal transition-colors hover:text-[var(--ink)]"
              style={{ color: "var(--stone)" }}
            >
              {label}
            </Link>
          ))}
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Link
            href="/entrar"
            className="hidden md:inline-flex h-9 items-center px-3.5 rounded-btn text-sm font-medium transition-colors hover:text-[var(--ink)]"
            style={{ color: "var(--stone)" }}
          >
            Entrar
          </Link>
          <Link
            href="#waitlist"
            className="hidden md:inline-flex h-9 items-center cta-primary px-4 text-sm"
          >
            Lista de espera
          </Link>

          {/* Mobile menu trigger — functionality added later */}
          <button
            type="button"
            className="inline-flex md:hidden h-9 w-9 items-center justify-center rounded-btn transition-colors hover:bg-[var(--subtle)]"
            style={{ color: "var(--stone)" }}
            aria-label="Abrir menu"
          >
            <Menu size={20} strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </header>
  );
}
