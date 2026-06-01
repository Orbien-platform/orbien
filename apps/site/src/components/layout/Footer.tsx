import Link from "next/link";

const PRODUCT_LINKS = [
  { href: "/funcionalidades", label: "Funcionalidades" },
  { href: "/precos", label: "Preços" },
  { href: "/funcionalidades#comparativo", label: "Comparativo" },
  { href: "/roadmap", label: "Roadmap" },
  { href: "/mudancas", label: "Mudanças" },
];

const COMPANY_LINKS = [
  { href: "/sobre", label: "Sobre" },
  { href: "/pastores-parceiros", label: "Pastores parceiros" },
  { href: "/contato", label: "Contato" },
  { href: "https://wa.me/5554999529683", label: "WhatsApp" },
];

const LEGAL_LINKS = [
  { href: "/termos", label: "Termos de uso" },
  { href: "/privacidade", label: "Política de privacidade" },
  { href: "/lgpd", label: "LGPD" },
  { href: "/status", label: "Status" },
];

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

export function Footer() {
  return (
    <footer
      className="border-t pt-16 pb-8"
      style={{ background: "var(--bg)", borderColor: "var(--border)" }}
    >
      <div className="mx-auto max-w-[1180px] px-6">
        {/* Columns grid */}
        <div className="grid grid-cols-2 gap-8 mb-12 sm:grid-cols-4 sm:gap-12">
          {/* Brand column */}
          <div className="col-span-2 sm:col-span-1">
            <Link
              href="/"
              className="flex items-center gap-2 font-sans text-[19px] font-medium tracking-[-0.02em] mb-3.5"
              style={{ color: "var(--ink)" }}
            >
              <BrandMark />
              Orbien
            </Link>
            <p
              className="text-sm font-light leading-relaxed mb-5 max-w-[280px]"
              style={{ color: "var(--stone)" }}
            >
              Gestão que serve. Igreja que cresce. Plataforma e app white-label para igrejas de 50 a 300 membros.
            </p>
            {/* Social icons */}
            <div className="flex gap-2.5">
              {[
                {
                  label: "Instagram",
                  href: "#",
                  icon: (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                      <line x1="17.5" y1="6.5" x2="17.5" y2="6.5" />
                    </svg>
                  ),
                },
                {
                  label: "YouTube",
                  href: "#",
                  icon: (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z" />
                      <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" />
                    </svg>
                  ),
                },
                {
                  label: "LinkedIn",
                  href: "#",
                  icon: (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
                      <rect x="2" y="9" width="4" height="12" />
                      <circle cx="4" cy="4" r="2" />
                    </svg>
                  ),
                },
              ].map(({ label, href, icon }) => (
                <a
                  key={label}
                  href={href}
                  aria-label={label}
                  className="w-8 h-8 flex items-center justify-center rounded-btn border transition-colors"
                  style={{ borderColor: "var(--border)", color: "var(--stone)" }}
                >
                  {icon}
                </a>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {[
            { heading: "Produto", links: PRODUCT_LINKS },
            { heading: "Empresa", links: COMPANY_LINKS },
            { heading: "Legal e segurança", links: LEGAL_LINKS },
          ].map(({ heading, links }) => (
            <div key={heading}>
              <h4
                className="font-mono text-[11px] font-medium uppercase tracking-[.14em] mb-[18px]"
                style={{ color: "var(--muted)" }}
              >
                {heading}
              </h4>
              <ul className="flex flex-col gap-3">
                {links.map(({ href, label }) => (
                  <li key={href}>
                    <Link
                      href={href}
                      className="text-sm transition-colors hover:text-[var(--ink)]"
                      style={{ color: "var(--stone)" }}
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div
          className="border-t pt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between font-mono text-[11px] tracking-[.06em]"
          style={{ borderColor: "var(--border)", color: "var(--muted)" }}
        >
          <div>© {new Date().getFullYear()} Church Platform Ltda · CNPJ a definir · Passo Fundo · RS</div>
          <div>orbien.app</div>
        </div>
      </div>
    </footer>
  );
}
