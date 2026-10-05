// Terminologia da igreja (v2, "Interações e regras"): célula, PG ou GC vem
// da configuração da igreja (`branding_configs.group_term_*`, lida em
// `GET /settings`) e aparece em menus e títulos. Sem termo configurado, o
// produto fala em "Grupo"/"Grupos".
//
// Só troca o substantivo isolado — aba, título de tela. Frases com artigo
// ou adjetivo ("Novo grupo", "Meus grupos") ficam como estão: o termo é
// livre e o gênero não vem junto ("Nova célula" × "Novo PG"). É a mesma
// fronteira que o painel adotou (docs/design/orbita-v2/PROJETO.md, §3.2).
import { useTheme } from "./theme-provider";

export interface GroupTerm {
  singular: string;
  plural: string;
}

export const DEFAULT_GROUP_TERM: GroupTerm = { singular: "Grupo", plural: "Grupos" };

/** Primeira letra em maiúscula, sem mexer no resto ("PG" continua "PG"). */
function capitalize(value: string): string {
  const trimmed = value.trim();
  return trimmed.charAt(0).toLocaleUpperCase("pt-BR") + trimmed.slice(1);
}

export function resolveGroupTerm(
  singular: string | null | undefined,
  plural: string | null | undefined,
): GroupTerm {
  if (!singular?.trim() || !plural?.trim()) return DEFAULT_GROUP_TERM;
  return { singular: capitalize(singular), plural: capitalize(plural) };
}

export function useGroupTerm(): GroupTerm {
  const { groupTermSingular, groupTermPlural } = useTheme();
  return resolveGroupTerm(groupTermSingular, groupTermPlural);
}
