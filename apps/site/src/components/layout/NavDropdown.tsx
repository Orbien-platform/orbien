"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const MODULES = [
  {
    href: "/funcionalidades/membros",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    title: "Membros",
    desc: "Cadastro, ciclo de vida e presença",
  },
  {
    href: "/funcionalidades/financeiro",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
        <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
        <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
      </svg>
    ),
    title: "Financeiro",
    desc: "PIX, recibos e relatórios",
  },
  {
    href: "/funcionalidades/pequenos-grupos",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="18" cy="18" r="3" /><circle cx="6" cy="6" r="3" />
        <path d="M13 6h3a2 2 0 0 1 2 2v7" /><line x1="6" y1="9" x2="6" y2="21" />
      </svg>
    ),
    title: "Pequenos Grupos",
    desc: "Semáforo, materiais e líder mobile",
  },
  {
    href: "/funcionalidades/conteudos",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
    ),
    title: "Conteúdos",
    desc: "Avisos, devocionais e oração",
  },
] as const;

export function NavDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, []);

  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {/* Trigger */}
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-sm font-normal transition-colors hover:text-[var(--ink)]"
        style={{ color: "var(--stone)" }}
      >
        Funcionalidades
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className="transition-transform duration-150"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Panel — outer wrapper has pt-3 so the padding bridges the gap
           between trigger and panel, keeping the mouse within the hit area */}
      {open && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 pt-3 w-[420px] z-50">
        <div
          className="rounded-[14px] border overflow-hidden"
          style={{
            background: "var(--surface)",
            borderColor: "var(--border)",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          {/* Grid of modules */}
          <div className="grid grid-cols-2 gap-px" style={{ background: "var(--border)" }}>
            {MODULES.map(({ href, icon, title, desc }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className="flex items-start gap-3 p-4 transition-colors hover:bg-[var(--subtle)]"
                style={{ background: "var(--surface)" }}
              >
                <span
                  className="w-8 h-8 rounded-[8px] flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ background: "var(--navy-tint)", color: "var(--navy-accent)" }}
                >
                  {icon}
                </span>
                <div>
                  <p className="text-[13px] font-medium" style={{ color: "var(--ink)" }}>{title}</p>
                  <p className="text-[11.5px] font-light mt-0.5" style={{ color: "var(--stone)" }}>{desc}</p>
                </div>
              </Link>
            ))}
          </div>

          {/* Footer */}
          <div
            className="flex items-center justify-between px-4 py-3 border-t"
            style={{ background: "var(--bg)", borderColor: "var(--border)" }}
          >
            <span className="font-mono text-[10px] uppercase tracking-[.1em]" style={{ color: "var(--muted)" }}>
              4 módulos disponíveis
            </span>
            <Link
              href="/funcionalidades"
              onClick={() => setOpen(false)}
              className="text-[12px] font-medium transition-colors hover:text-[var(--ink)]"
              style={{ color: "var(--navy-accent)" }}
            >
              Ver todos →
            </Link>
          </div>
        </div>
        </div>
      )}
    </div>
  );
}
