# STATE

## Decisions

### AD-001
- **Decision**: `apps/mobile` (Expo/React Native) usa um único codebase para as
  duas variantes de distribuição (Starter genérico multi-tenant e a futura
  Premium white-label por tenant). As variantes diferem só por *build
  profile* do EAS (`eas.json`) combinado a um `app.config.js` dinâmico
  (função, não `app.json` estático) que resolve nome, ícone, bundle
  id/applicationId, scheme e app id do OneSignal a partir de env/`extra` por
  profile. Nenhum desses valores pode ser hardcoded em código-fonte
  compartilhado (telas, componentes, chamadas à API).
- **Reason**: fork de código por variante diverge com o tempo (fix na
  Starter não chega na Premium) e obriga reescrever a variante genérica
  quando o Premium (ADR-005) for implementado. Config dinâmica por profile é
  o único mecanismo que deixa o Premium herdar tudo que o v1 entregar sem
  retrabalho de arquitetura.
- **Trade-off**: exige que todo componente que hoje "só" mostraria "Orbien"
  passe a ler isso de `Constants.expoConfig.extra` em vez de literal — um
  pouco mais de indireção desde o v1, mesmo o Premium ainda não existindo.
- **Scope**: `apps/mobile` inteiro — qualquer PR que adicionar tela/módulo
  novo ao mobile deve seguir essa regra para nome do app, ícone, bundle id e
  identificadores de push.
- **Date**: 2026-09-08
- **Status**: active
