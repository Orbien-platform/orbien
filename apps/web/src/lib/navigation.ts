import {
  Building2,
  CalendarDays,
  ChartLine,
  ChartNoAxesColumn,
  Eye,
  FileText,
  GitBranch,
  HeartHandshake,
  House,
  Layers,
  type LucideIcon,
  Megaphone,
  Music,
  Users,
} from "lucide-react";

/**
 * Menu do painel na arquitetura da direção Órbita
 * (`docs/design/orbita-v2/README.md`): itens agrupados por rotina da igreja,
 * não por tabela.
 *
 * Só entra aqui rota que existe. As áreas que o README prevê e que ainda não
 * têm tela (Visitantes, Famílias, Escalas, Eventos, as sub-áreas do
 * Financeiro e da Administração…) entram quando a tela entrar — link para 404
 * não é menu. Quem decide se o item aparece para a sessão é
 * `canAccessRoute`, em `permissions.ts`.
 */
export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /**
   * O rótulo é o termo da igreja para pequeno grupo, no plural ("Células",
   * "PGs"…), não o `label` fixo. Ver `navLabel`.
   */
  usesGroupTerm?: boolean;
}

export interface NavSection {
  /** `null` para o bloco do topo, que não leva título. */
  title: string | null;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    title: null,
    items: [{ href: "/dashboard", label: "Início", icon: House }],
  },
  {
    title: "Pessoas",
    items: [
      { href: "/pessoas", label: "Pessoas", icon: Users },
      // Presença nos cultos: média por categoria, a partir da contagem lançada
      // por quem está na escala. É o "Indicadores" que o design Órbita já previa.
      { href: "/pessoas/indicadores", label: "Indicadores", icon: ChartNoAxesColumn },
    ],
  },
  {
    title: "Comunidade",
    items: [
      { href: "/grupos", label: "Grupos", icon: HeartHandshake, usesGroupTerm: true },
      { href: "/redes", label: "Redes", icon: GitBranch },
      { href: "/materiais", label: "Materiais", icon: FileText },
    ],
  },
  {
    title: "Cultos e serviço",
    items: [
      { href: "/celebracoes", label: "Celebrações", icon: CalendarDays },
      { href: "/voluntarios", label: "Ministérios", icon: Layers },
      { href: "/repertorio", label: "Repertório", icon: Music },
    ],
  },
  {
    title: "Comunicação",
    items: [{ href: "/conteudo", label: "Publicações", icon: Megaphone }],
  },
  {
    title: "Financeiro",
    items: [{ href: "/financeiro", label: "Visão geral", icon: ChartLine }],
  },
  {
    title: "Administração",
    items: [
      { href: "/configuracoes", label: "Configurações", icon: Building2 },
      { href: "/auditoria", label: "Auditoria", icon: Eye },
    ],
  },
];

/** Rótulo do item, com o termo da igreja onde o item o usa. */
export function navLabel(item: NavItem, groupTermPlural: string): string {
  return item.usesGroupTerm ? groupTermPlural : item.label;
}

/** A rota está ativa no pathname atual — ela mesma ou uma sub-rota dela. */
export function isActiveRoute(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}

/**
 * Seção e item do menu do pathname, para o caminho de navegação do topo.
 * Telas fora do menu (o perfil, que fica no menu da conta) respondem `null`.
 */
export function findNavEntry(
  pathname: string
): { section: string | null; item: NavItem } | null {
  let best: { section: string | null; item: NavItem } | null = null;
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      // O mais específico vence: "/pessoas/indicadores" é do item Indicadores,
      // não de Pessoas, que também casa por prefixo.
      if (
        isActiveRoute(pathname, item.href) &&
        (!best || item.href.length > best.item.href.length)
      ) {
        best = { section: section.title, item };
      }
    }
  }
  return best;
}

/** O `href` do item de menu que representa o pathname — um só, o mais específico. */
export function activeNavHref(pathname: string): string | null {
  return findNavEntry(pathname)?.item.href ?? null;
}
