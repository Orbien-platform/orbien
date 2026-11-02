// Termo de consentimento do responsável para o tratamento de dados da criança
// (LGPD, Art. 14). A versão é gravada em cada `ConsentRecord`; mudou o texto,
// sobe a versão. O texto completo e a base legal ficam em
// docs/produto/orbien-lgpd-mapping.md (T36); aqui vai o que o app mostra no
// aceite e devolve no 422.
//
// Subir a versão (REV-4.5): aceite de versão antiga vale como ausente, então todo
// responsável fica sem consentimento vigente no mesmo instante e o check-in dele
// passa a falhar com 422 `kids_consent_required`. Antes de subir: avisar a
// secretaria, que pode registrar o aceite em nome do responsável (origem
// `secretaria`), e conferir o texto novo com o jurídico. O aceite antigo é
// revogado com o motivo `superseded_by_new_term` no novo aceite, nunca apagado.
export const KIDS_TERM_VERSION = 'kids-2026-10';

export const KIDS_TERM_TEXT =
  'Autorizo a igreja a tratar os dados do(s) meu(s) filho(s), inclusive alergias e observações de saúde, ' +
  'apenas para a operação do ministério infantil: entrada, saída segura e cuidado durante o culto. ' +
  'Posso revogar este consentimento a qualquer momento; o histórico de presença é mantido até o prazo de retenção.';

// `kids`: o próprio responsável aceitou no app. `secretaria`: a secretaria
// registrou em nome dele (spec, AC 7).
export const KIDS_CONSENT_ORIGINS = ['kids', 'secretaria'] as const;
export type KidsConsentOrigin = (typeof KIDS_CONSENT_ORIGINS)[number];
