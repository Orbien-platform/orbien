import { Lock } from "lucide-react";

/**
 * O que a tela mostra quando o servidor respondeu 403.
 *
 * Existe porque as telas do `(admin)` engoliam todo erro de carga com
 * `.catch(() => setX([]))`: um 403 virava lista vazia, e quem não tem
 * permissão lia "Nenhuma celebração cadastrada" — concluindo que a igreja não
 * tem culto, não que lhe falta acesso. As duas situações são indistinguíveis
 * na tela e não deveriam ser.
 *
 * Não é uma barreira: a barreira é o servidor, e ela já estava de pé. Isto é
 * só a leitura honesta da resposta que ele deu.
 *
 * Sem moldura própria de propósito: nas telas de lista ele ocupa o lugar do
 * estado vazio, dentro da tabela que já tem borda; nos painéis, o lugar do
 * "nenhum X cadastrado", dentro do card. Uma caixa a mais empilharia bordas.
 */
export function NoAccessState({ resource }: { resource: string }) {
  return (
    <div
      role="status"
      className="flex flex-col items-center justify-center gap-2 px-6 py-8 text-center"
    >
      <Lock size={24} strokeWidth={1.5} className="text-stone" />
      <p className="text-sm font-medium text-ink">Você não tem acesso a {resource}.</p>
      <p className="max-w-sm text-sm text-stone">
        Seu papel nesta congregação não inclui esta área. Fale com um
        administrador se precisar de acesso.
      </p>
    </div>
  );
}
