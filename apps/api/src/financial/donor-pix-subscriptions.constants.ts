/**
 * Limites do dízimo automático contratado pelo próprio doador (PROD-28).
 * Provisórios — o valor de verdade é pergunta aberta ao dono do produto
 * (Q4 em `.specs/features/pix-recorrente-doador-mobile/spec.md`). O app
 * espelha os mesmos números para validar antes de enviar; a autoridade é o
 * DTO da API.
 */
export const DONOR_SUBSCRIPTION_MIN_AMOUNT = 10;
export const DONOR_SUBSCRIPTION_MAX_AMOUNT = 5000;

/**
 * Versão do texto de aceite mostrado ao doador. Trocar o texto é trocar a
 * versão — aqui e no app — e quem aceitou a anterior continua registrado com
 * ela em `pix_subscriptions.consent_version`.
 */
export const DONOR_RECURRING_CONSENT_VERSION = 'dizimo-automatico-v1';
