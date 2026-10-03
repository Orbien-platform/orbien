import { ServiceUnavailableException } from '@nestjs/common';

/**
 * Trava única das cobranças pela Asaas (PIX dinâmico, PIX recorrente do
 * tesoureiro e do doador, inscrição paga de evento). Desligada por padrão,
 * para todo tenant — Premium inclusive — até o modelo de `AD-007` existir:
 * hoje toda cobrança cai na conta raiz da Orbien, sem split, e é isso que
 * não pode ir para usuário (`PEND-16`, `PROD-28` em `docs/PLANO.md`).
 *
 * O que a trava barra é **criar cobrança nova**. Não barra listar nem
 * cancelar assinatura que já exista, nem o webhook: cobrança já emitida
 * precisa poder ser confirmada, e quem foi cobrado precisa poder parar.
 * PIX manual (Cenário 1) e doação pública (Cenário 3) não passam pela
 * Asaas e não dependem dela.
 *
 * Liga com `ASAAS_PAYMENTS_ENABLED=true` — só o literal `true` liga, para
 * que valor esquecido ou digitado errado nunca abra cobrança.
 */
export function asaasPaymentsEnabled(): boolean {
  return process.env['ASAAS_PAYMENTS_ENABLED'] === 'true';
}

export const ASAAS_PAYMENTS_DISABLED_MESSAGE =
  'Pagamentos pelo app ainda não estão disponíveis';

export function assertAsaasPaymentsEnabled(): void {
  if (!asaasPaymentsEnabled()) {
    throw new ServiceUnavailableException(ASAAS_PAYMENTS_DISABLED_MESSAGE);
  }
}
