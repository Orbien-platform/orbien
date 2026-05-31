import Link from "next/link";

const FOOTER_COLUMNS = [
  {
    heading: "Produto",
    links: [
      { href: "/funcionalidades", label: "Funcionalidades" },
      { href: "/precos", label: "Preços" },
      { href: "/sem-cnpj", label: "Sem CNPJ" },
      { href: "/app-mobile", label: "App mobile" },
    ],
  },
  {
    heading: "Empresa",
    links: [
      { href: "/sobre", label: "Sobre" },
      { href: "/blog", label: "Blog" },
      { href: "/contato", label: "Contato" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { href: "/privacidade", label: "Privacidade" },
      { href: "/termos", label: "Termos de uso" },
      { href: "/lgpd", label: "LGPD" },
    ],
  },
] as const;

export function Footer() {
  return (
    <footer className="border-t border-border bg-surface">
      {/* Main columns */}
      <div className="mx-auto max-w-7xl px-6 py-12 lg:px-8 lg:py-16">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {/* Brand column */}
          <div className="col-span-2 md:col-span-1">
            <span className="font-sans text-xl font-medium tracking-tight text-navy">
              orbien
            </span>
            <p className="mt-3 text-sm font-light text-stone leading-relaxed max-w-[200px]">
              Gestão que serve.
              <br />
              Igreja que cresce.
            </p>
          </div>

          {/* Link columns */}
          {FOOTER_COLUMNS.map(({ heading, links }) => (
            <div key={heading}>
              <h3 className="text-xs font-medium uppercase tracking-[0.1em] text-ghost">
                {heading}
              </h3>
              <ul className="mt-4 space-y-3">
                {links.map(({ href, label }) => (
                  <li key={href}>
                    <Link
                      href={href}
                      className="text-sm text-stone transition-colors hover:text-ink"
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-6 py-5 sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <p className="text-xs text-ghost">
            © {new Date().getFullYear()} Orbien · todos os direitos reservados
          </p>
          <p className="text-xs text-ghost">
            orbien.app
          </p>
        </div>
      </div>
    </footer>
  );
}
