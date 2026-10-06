"use client"

import * as React from "react"
import { ArrowLeft } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Página de detalhe — substitui o painel lateral (`Sheet`) nas telas de
 * edição. Renderiza inline, ocupando a área de conteúdo, em vez de uma
 * subtela de 440–520px: abas, tabelas e formulários ganham a largura toda.
 *
 * A API espelha a do Sheet (`open`/`onOpenChange` + Header/Title/Description)
 * para que o conteúdo de cada tela de detalhe continue o mesmo; só o
 * contêiner mudou. `open=false` não renderiza nada.
 */

const DetailPageContext = React.createContext<{ titleId: string; descriptionId: string } | null>(null)

interface DetailPageProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Texto do botão de voltar, ex.: "Voltar para grupos". */
  backLabel?: string
  /** Largura máxima do conteúdo. */
  className?: string
  children: React.ReactNode
}

function DetailPage({
  open,
  onOpenChange,
  backLabel = "Voltar",
  className,
  children,
}: DetailPageProps) {
  const id = React.useId()
  const ctx = React.useMemo(
    () => ({ titleId: `${id}-title`, descriptionId: `${id}-description` }),
    [id]
  )

  // Esc volta para a lista, como fechava o painel. Ignora quando o foco está
  // dentro de um diálogo aberto por cima (confirmações, modais de registro).
  React.useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape" || e.defaultPrevented) return
      if (document.querySelector("[role='dialog'],[role='alertdialog']")) return
      onOpenChange(false)
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [open, onOpenChange])

  // O conteúdo rola dentro do <main>; ao abrir o detalhe, começa do topo.
  const ref = React.useRef<HTMLElement>(null)
  React.useEffect(() => {
    if (open) ref.current?.closest("main")?.scrollTo?.({ top: 0 })
  }, [open])

  if (!open) return null

  return (
    <DetailPageContext.Provider value={ctx}>
      <section
        ref={ref}
        data-slot="detail-page"
        aria-labelledby={ctx.titleId}
        className={cn("mx-auto flex w-full max-w-5xl flex-col gap-4", className)}
      >
        <div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="inline-flex items-center gap-1.5 rounded-[8px] px-2 py-1 text-sm text-stone transition-colors hover:bg-[var(--surface-subtle)] hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--navy,currentColor)] dark:hover:text-white"
          >
            <ArrowLeft size={15} strokeWidth={1.5} aria-hidden="true" />
            {backLabel}
          </button>
        </div>
        {children}
      </section>
    </DetailPageContext.Provider>
  )
}

function DetailPageContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="detail-page-content"
      className={cn(
        "flex flex-col overflow-hidden rounded-[16px] border border-[var(--border-default)] bg-[var(--surface-base)] text-sm shadow-[var(--shadow-sm,none)]",
        className
      )}
      {...props}
    />
  )
}

function DetailPageHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="detail-page-header"
      className={cn("flex flex-col gap-0.5 p-4", className)}
      {...props}
    />
  )
}

function DetailPageTitle({ className, ...props }: React.ComponentProps<"h1">) {
  const ctx = React.useContext(DetailPageContext)
  return (
    <h1
      id={ctx?.titleId}
      data-slot="detail-page-title"
      className={cn("font-heading text-lg font-medium text-foreground", className)}
      {...props}
    />
  )
}

function DetailPageDescription({ className, ...props }: React.ComponentProps<"p">) {
  const ctx = React.useContext(DetailPageContext)
  return (
    <p
      id={ctx?.descriptionId}
      data-slot="detail-page-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  DetailPage,
  DetailPageContent,
  DetailPageHeader,
  DetailPageTitle,
  DetailPageDescription,
}
