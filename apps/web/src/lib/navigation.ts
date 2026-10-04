import {
  Building2,
  CalendarDays,
  ChartLine,
  Eye,
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
 * têm tela (Visitantes, Famílias, Materiais, Escalas, Eventos, as sub-áreas do
 * Financeiro e da Administração…) entram quando a tela entrar — link para 404
 * não é menu. Quem decide se o item aparece para a sessão é
 * `canAccessRoute`, em `permissions.ts`.
 */
export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
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
    items: [{ href: "/pessoas", label: "Pessoas", icon: Users }],
  },
  {
    title: "Comunidade",
    items: [
      { href: "/grupos", label: "Grupos", icon: HeartHandshake },
      { href: "/redes", label: "Redes", icon: GitBranch },
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
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      if (isActiveRoute(pathname, item.href)) {
        return { section: section.title, item };
      }
    }
  }
  return null;
}
