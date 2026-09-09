// decodeJwtPayload (MOB-07) — leitura do payload de um JWT, sem validar
// assinatura. Decodificar não é validar: quem valida é a API, sempre. Uso
// legítimo é config/exibição local e escolha de UI não-autoritativa — nunca
// a decisão que abre ou nega dado, porque `roles` fica até 15min desatualizado
// entre uma promoção/revogação e o próximo refresh. Mesmo princípio e mesmo
// algoritmo de apps/web/src/lib/auth.ts. Usado para montar as tags do
// OneSignal (design.md, Rodada 4) e, no MOB-08, para escolher qual fonte de
// dados a aba Celebrações chama — se o papel estiver desatualizado, a API
// que decide de verdade rejeita a chamada errada (RolesGuard), então o pior
// caso é a tela mostrar a fonte/mensagem errada por até 15min, nunca dado
// que a role atual não deveria ver.
//
// `atob` é global nativo do Hermes (motor JS do RN) desde que passou a ser
// builtin do motor — sem polyfill/lib nova (design.md, Pesquisa da Rodada 4).

export interface MobileJwtPayload {
  sub: string;
  tenant_id: string;
  congregation_id: string;
  roles: string[];
  exp: number;
}

export function decodeJwtPayload(token: string): MobileJwtPayload | null {
  try {
    const base64Url = token.split(".")[1];
    if (!base64Url) return null;
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64)) as MobileJwtPayload;
  } catch {
    return null;
  }
}
