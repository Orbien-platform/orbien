# Home do app mobile — spec (Medium)

## Contexto

A aba raiz (`(tabs)/index.tsx`, MOB-04, verificada e fechada em
`app-mobile/spec.md`) mostra só a lista de escala do usuário — "Tela Escala",
não uma home. É a primeira coisa que qualquer papel vê depois do login e,
hoje, quem não tem escala próxima abre o app numa tela quase vazia (só o
atalho de indisponibilidade e o estado "Nenhuma escala próxima").

Pedido do usuário: tornar essa tela "útil e atrativa" como home do app —
melhoria de UX de tela existente, não funcionalidade de produto nova. Por
isso não abre item `PROD-` em `docs/PLANO.md`; MOB-04 continua verificada
como está (a escala continua funcionando exatamente igual, com os mesmos
critérios de aceite e os mesmos testes).

## Restrição que define o desenho

O app não tem nome nem e-mail do usuário em lugar nenhum (nem token, nem
`/settings` — registrado em `perfil.tsx`, linhas 12-14). Uma home
"personalizada" com nome fica fora de escopo sem rota nova na API, que este
pedido não pede. A saudação é por horário do dia, não por nome.

`listUpcomingInstances` (Celebrações) é exclusiva de `ministry_leader`+
(`celebracoes-client.ts`) — não entra na home porque a home é para todos os
papéis sem checagem de role adicional. `listMyGroups` e `getPosts` não têm
essa restrição (já usados em `grupos.tsx`/`conteudo.tsx` sem gate de papel) —
são a fonte dos dois destaques novos.

## Requisitos

- **HOME-01** — Saudação por horário do dia ("Bom dia"/"Boa tarde"/"Boa
  noite") entre o `BrandHeader` e o resto do conteúdo. Função pura
  `getGreeting(date: Date): string`, testável sem mockar `Date` global.
- **HOME-02** — Destaque "Meus grupos": até 2 grupos de `listMyGroups()`,
  cartão com nome + `meeting_time` (mesmo padrão visual de `grupos.tsx`),
  toque navega para `/grupo/[id]`. Falha ao carregar não bloqueia a tela
  (degrada para seção ausente, silenciosa — não é dado crítico da home).
  Vazio (usuário sem grupo) também omite a seção, sem placeholder.
- **HOME-03** — Destaque "Avisos recentes": até 3 posts de
  `getPosts(1, 3)`, cartão compacto com título + data (mesmo padrão de
  `conteudo.tsx`), toque navega para `/post/[id]`. Mesma regra de
  degradação silenciosa que HOME-02 (erro ou lista vazia → seção ausente).
- **HOME-04** — A lista de escala (MOB-04) continua exatamente como está:
  mesmo fetch único no mount, mesmos testIDs (`escala-list`, `escala-error`,
  `escala-empty`, `assignment-*`, `confirm-*`, `decline-*`, `check-in-*`,
  `indisponibilidade-link`, `escala-action-error`), mesmo comportamento de
  erro bloqueante (`escala-error` substitui a tela inteira, como hoje —
  HOME-02/03 não amenizam esse caso porque a escala é o dado principal da
  tela, os destaques são secundários).
- **HOME-05** — Ordem visual: `BrandHeader` → saudação → atalho de
  indisponibilidade (como hoje) → "Meus grupos" (se houver) → "Avisos
  recentes" (se houver) → seção "Próximas escalas" (lista existente).

## Fora de escopo

- Celebrações (role-gated, ver acima).
- Nome/e-mail do usuário (sem dado disponível).
- Notificações não lidas em destaque (fora do que os clients atuais expõem
  como contagem).
- Qualquer mudança em `docs/PLANO.md` — isto não é um `PROD-`.

## Critérios de aceite (por requisito)

- HOME-01: `getGreeting(new Date("...T08:00"))` → "Bom dia";
  `T14:00` → "Boa tarde"; `T20:00` → "Boa noite"; limites em 12:00 e 18:00
  testados nos dois lados.
- HOME-02: mock de `listMyGroups` com 1, 2 e 3 grupos (corta em 2), com 0
  grupos (seção ausente) e com rejeição (seção ausente, sem `escala-error`).
- HOME-03: mesmo padrão de HOME-02 para `getPosts`.
- HOME-04: suíte atual de `index.test.tsx` (12 casos) continua passando sem
  alteração de asserção.
