import Link from "next/link";
import { Menu } from "lucide-react";

const NAV_LINKS = [
  { href: "/funcionalidades", label: "Funcionalidades" },
  { href: "/precos", label: "Preços" },
  { href: "/sem-cnpj", label: "Sem CNPJ" },
  { href: "/sobre", label: "Sobre" },
] as const;

function BrandMark() {
  return (
    <span
      className="w-[22px] h-[22px] relative flex-shrink-0"
      style={{ color: "var(--navy-accent)" }}
    >
      <svg viewBox="0 0 22 22" fill="none" className="w-full h-full">
        <ellipse cx="11" cy="11" rx="9" ry="4" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="11" cy="11" r="3" fill="currentColor" />
        <circle cx="20" cy="11" r="2" fill="#00B8A2" />
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
        borderColor: "rgba(224,221,217,.6)",
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
            className="hidden md:inline-flex h-9 items-center rounded-btn bg-navy px-4 text-sm font-medium text-white transition-colors hover:bg-navy-dark"
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
