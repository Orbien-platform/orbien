/**
 * Fuso de exibição do produto.
 *
 * O banco grava no fuso do servidor — não há problema nisso, e nada aqui
 * muda o que está gravado. O que este módulo garante é a outra ponta: toda
 * data que o usuário vê sai em horário de Brasília, independente do fuso da
 * máquina dele. Sem isso, `toLocaleDateString` usa o fuso do navegador e a
 * mesma celebração aparece em dias diferentes para dois usuários.
 *
 * São duas funções, e não uma, de propósito — a diferença não é estilo, é
 * correção:
 *
 * - `formatInstant` é para momento no tempo (`created_at`, `occurred_at`,
 *   `publish_at`). Converter para São Paulo é exatamente o certo: o
 *   instante é o mesmo, muda só como ele é lido.
 *
 * - `formatCivilDate` é para data sem hora (`birth_date`, `membership_date`,
 *   `baptism_date`, `anchor_date`, `scheduled_date`). A API grava essas como
 *   meia-noite UTC — `new Date('2026-01-15')` em `persons-import.service.ts`
 *   é `2026-01-15T00:00:00Z`, e o mesmo vale para `scheduled_date` em
 *   `celebration-instances.service.ts`. Converter isso para São Paulo tira
 *   três horas e devolve **14/01**: aniversário (ou culto) um dia antes. Por
 *   isso ela formata em UTC — o dia que foi gravado é o dia que aparece.
 *
 * Escolher a função errada não quebra teste nem tipo: devolve uma data
 * plausível e errada por um dia. Na dúvida, olhe se o campo tem hora.
 */
export const DISPLAY_TIME_ZONE = "America/Sao_Paulo";

/** Momento no tempo, exibido em horário de Brasília. */
export function formatInstant(
  iso: string | Date,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Date(iso).toLocaleString("pt-BR", {
    ...options,
    timeZone: DISPLAY_TIME_ZONE,
  });
}

/** Data civil (sem hora), exibida como foi gravada — sem converter fuso. */
export function formatCivilDate(
  iso: string | Date,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Date(iso).toLocaleString("pt-BR", {
    ...options,
    timeZone: "UTC",
  });
}

/**
 * O dia civil de Brasília em que um instante caiu, como "YYYY-MM-DD".
 *
 * É o que permite agrupar por dia sem depender do fuso da máquina: duas
 * chaves são comparáveis com `<`/`>` direto, porque ISO ordena
 * lexicograficamente. `en-CA` é usado só porque é o locale cujo formato
 * curto já é ISO — não tem nada de canadense na escolha.
 */
export function saoPauloDateKey(at: string | Date): string {
  return new Date(at).toLocaleDateString("en-CA", {
    timeZone: DISPLAY_TIME_ZONE,
  });
}

/**
 * O dia civil de Brasília como `Date` cujos componentes **UTC** são esse dia.
 *
 * Serve para aritmética de calendário (somar dias, achar a segunda-feira):
 * feita com os métodos `setUTC*`, ela não tropeça em horário de verão nem no
 * fuso de quem abriu a página. O valor não é um instante — é um dia civil
 * carregado num `Date`, e só deve ser lido de volta com `getUTC*` ou
 * formatado com `formatCivilDate`.
 */
export function saoPauloCivilDay(at: string | Date): Date {
  return new Date(`${saoPauloDateKey(at)}T00:00:00Z`);
}

/** A chave "YYYY-MM-DD" de um dia civil produzido por `saoPauloCivilDay`. */
export function civilDayKey(day: Date): string {
  return day.toISOString().slice(0, 10);
}
