// Cadastro de visitante pela liderança (v2, "Cadastrar visitante").
//
// É o `POST /persons` do painel com `classification: "visitor"`: a API cria
// a pessoa e devolve, em `possible_duplicates`, quem já tem o mesmo
// telefone na igreja. A deduplicação é depois do cadastro, não antes — o app
// mostra os nomes para a liderança decidir, no painel, se mescla.
import { authenticatedRequest } from "../auth/auth-client";

export interface NewVisitor {
  full_name: string;
  phone?: string;
  email?: string;
}

export interface PossibleDuplicate {
  id: string;
  full_name: string;
  phone: string | null;
  classification: "visitor" | "attendee" | "member";
}

export interface RegisterVisitorResult {
  person: { id: string; full_name: string };
  possible_duplicates: PossibleDuplicate[];
}

/** Só dígitos e o `+` inicial: o telefone é comparado como texto na API,
 * então "(11) 99999-0000" e "11999990000" seriam pessoas diferentes. */
export function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  return trimmed.startsWith("+") ? `+${digits}` : digits;
}

export async function registerVisitor(input: NewVisitor): Promise<RegisterVisitorResult> {
  const phone = input.phone ? normalizePhone(input.phone) : "";
  const email = input.email?.trim() ?? "";
  return authenticatedRequest<RegisterVisitorResult>("post", "/persons", {
    body: {
      full_name: input.full_name.trim(),
      classification: "visitor",
      ...(phone ? { phone } : {}),
      ...(email ? { email } : {}),
    },
  });
}
