// Formatação de dinheiro em BRL, sem `Intl` — mesmo motivo que
// `./date.ts` documenta para as datas: o Hermes só traz os dados de locale
// completos em build com `intl` habilitado, e `toLocaleString("pt-BR", {
// style: "currency" })` cai em en-US **em silêncio** quando não há dado.
// "R$ 1.234,56" viraria "R$1,234.56" — preço errado na tela sem nenhum
// erro, e preço errado é pior que data errada.
//
// O web faz o contrário (`toLocaleString` em
// `EventRegistrationsPanel.tsx`) e está certo lá: no browser o dado de
// locale sempre existe.

/** "R$ 1.234,56". Centavos sempre presentes — preço de inscrição é valor
 * cobrado, e "R$ 50" ao lado de "R$ 50,00" na mesma tela confunde. */
export function formatBRL(value: number): string {
  const cents = Math.round(Math.abs(value) * 100);
  const whole = String(Math.floor(cents / 100));
  const fraction = String(cents % 100).padStart(2, "0");

  // Separador de milhar da direita para a esquerda, de 3 em 3.
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  return `${value < 0 ? "-" : ""}R$ ${grouped},${fraction}`;
}
