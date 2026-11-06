import { canAccessRoute, isUpgradeRoute, type AccessSubject } from "@/lib/permissions";
import { NAV_SECTIONS, navLabel } from "@/lib/navigation";

/** Uma tela que a paleta ⌘K sabe abrir. */
export interface PaletteEntry {
  href: string;
  label: string;
  /** Seção do menu onde a tela mora; `null` para as que ficam fora dele. */
  section: string | null;
  /** O papel só alcançaria a tela no Premium — o menu a mostra com a coroa. */
  upgrade: boolean;
}

/**
 * As telas que a sessão enxerga, na ordem do menu, mais as que moram no menu
 * da conta (o Perfil).
 *
 * É a mesma regra do `Sidebar`: o que o menu não desenha, a paleta não
 * oferece. É conveniência de navegação, não controle de acesso — a tela que
 * abrir responde "sem acesso" se o servidor negar.
 */
export function paletteEntries(
  subject: AccessSubject | null | undefined,
  groupTermPlural: string
): PaletteEntry[] {
  const entries: PaletteEntry[] = [];
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      const upgrade = isUpgradeRoute(subject, item.href);
      if (!canAccessRoute(subject, item.href) && !upgrade) continue;
      entries.push({
        href: item.href,
        label: navLabel(item, groupTermPlural),
        section: section.title,
        upgrade,
      });
    }
  }
  entries.push({ href: "/perfil", label: "Perfil", section: null, upgrade: false });
  return entries;
}

/** Minúsculas e sem acento: "celebracoes" acha "Celebrações". */
export function normalizeSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

/**
 * Filtra pelo que foi digitado, no rótulo ou na seção. Quem começa pelo termo
 * vem antes de quem só o contém; dentro de cada grupo vale a ordem do menu.
 */
export function filterEntries(entries: PaletteEntry[], query: string): PaletteEntry[] {
  const q = normalizeSearch(query);
  if (!q) return entries;
  const starts: PaletteEntry[] = [];
  const contains: PaletteEntry[] = [];
  for (const entry of entries) {
    const label = normalizeSearch(entry.label);
    if (label.startsWith(q)) starts.push(entry);
    else if (label.includes(q) || normalizeSearch(entry.section ?? "").includes(q)) {
      contains.push(entry);
    }
  }
  return [...starts, ...contains];
}
