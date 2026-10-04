# Handoff: Orbien v2 · direção "Órbita" (site, painel web e app)

## Overview
Proposta v2 da Orbien em três superfícies:
1. **Site** (8 páginas de marketing), com nova identidade noturna.
2. **Painel web** (gestão da igreja, em `{igreja}.orbien.app`), com a nova arquitetura de informação: menu em seções, início por papel, entidades com página própria e financeiro e administração em sub-áreas.
3. **App mobile** (membro, voluntário, liderança): login com tema da igreja, início, conteúdo, Bíblia, célula, escalas, celebração/OC, doação PIX, notificações, perfil/LGPD e cadastro de visitante.

Use **apenas a v2**. A v1 e as amostras de direção ficaram no projeto de design e não fazem parte deste pacote.

## About the Design Files
Os arquivos deste pacote são **referências de design feitas em HTML**: protótipos que mostram aparência e comportamento, não código de produção para copiar. A tarefa é **recriar estas telas no ambiente existente do repositório** (apps/web, app mobile, site), seguindo os padrões, componentes e bibliotecas que o MVP já usa. Não importe os JSX daqui: eles rodam com Babel no navegador e usam dados fictícios (`proto/data.jsx`).

Para ver os protótipos, abra os `.html` num navegador. O painel de Tweaks não aparece fora do ambiente de design. Para trocar papel ou plano, edite o bloco `WEB_DEFAULTS` / `APP_DEFAULTS` em `proto/*-main-v2.jsx`.

## Fidelity
**Alta fidelidade** para cores, tipografia, raios, estados e copy.
**Média fidelidade** para densidade e espaçamentos das telas do produto: siga o grid e os componentes do codebase quando divergirem.
No site, a v2 é uma **camada de estilo** (`site/site-orbita.css`) aplicada sobre a estrutura atual das páginas. A estrutura e o conteúdo de cada página não mudaram.

## Etiquetas de origem nas telas
Cada recurso traz uma etiqueta que indica a situação no MVP (vem do briefing de produto):
- `EXISTE`: já existe no produto. Reestilize e reposicione.
- `API`: a API já faz, falta a tela. Implemente.
- `PROMESSA`: prometido sem código. Fora do escopo desta entrega, salvo decisão de produto.
- `PROPOSTA`: ideia de design. Validar antes de implementar.
As etiquetas não fazem parte da UI final.

## Design Tokens (Órbita)

### Cores: tema escuro (padrão)
| Token | Valor | Uso |
|---|---|---|
| bg | `#05070F` | fundo da página/app |
| surface | `#0B0F1D` (cards: gradiente `#0C1121 → #090C18`) | cards, sidebar, topbar |
| subtle | `#121729` | campos, hover, segmentados |
| fg | `#F2F1EE` | texto principal |
| stone | `#A9AEBD` | texto secundário |
| muted | `#6C7286` | legendas, rótulos |
| border | `rgba(255,255,255,.08)` / forte `rgba(255,255,255,.16)` | divisórias |
| navy (marca) | `#1E3A7B`, brilho `#2B4FA8` | cor padrão da igreja, glows |
| teal (acento) | `#00E5C7` | CTA do site, destaques, progresso, estado "ok" |
| amber | texto `#F2C766`, fundo `rgba(242,199,102,.12)` | atenção |
| crimson | texto `#FF7A6B`, fundo `rgba(255,122,107,.12)` | erro, crítico, sessão de suporte (`#C0392B` sólido) |

Tema claro (alternável no produto): bg `#F4F3EF`, surface `#FFFFFF`, subtle `#ECEBE6`, border `#E2E0DA`, teal texto `#007F70`.

### White-label
`--brand` = cor da igreja (padrão `#1E3A7B`). Botões primários do **produto** usam `--brand`. No escuro, o texto em cor da marca é `color-mix(brand 45%, white)` e o fundo suave é `color-mix(brand 28%, bg)`. O **teal é da Orbien** e não muda com a igreja. O site usa teal nos CTAs.

### Tipografia
- Display/títulos: **Instrument Serif** 400 (itálico em teal para ênfase). Site h1 `clamp(52px, 7.2vw, 104px)`, line-height .98. Títulos de página no painel: 26–32px.
- UI/corpo: **Geist** 300–600. Corpo 14px (produto), 16–19px (site lead).
- Números, rótulos e cabeçalhos de tabela: **Geist Mono** 400/500. Rótulo: 10.5–11px, uppercase, tracking .14em.

### Forma
- Botões, badges e segmentados: pill (`999px`). Alturas 30 / 36 / 46px (produto) e 42 / 52px (site).
- Cards: raio 14px (painel), 16–20px (app). Inputs: 10px.
- Sombras: quase nenhuma no escuro. Elevação por borda + glow (`0 0 30px` da cor). Modal/menus: `0 30px 80px rgba(0,0,0,.6)`.
- Assinatura visual: anéis concêntricos de órbita com um ponto teal orbitando (26s, linear, infinito) no hero do site e no fundo do painel.

## Painel web: arquitetura de informação
Menu em seções. Cada item aparece só para os papéis com acesso (ver `NAV` em `proto/web-shell.jsx`):
- **Início** (por papel: pastor/admin, secretaria, tesoureiro, líder de ministério, supervisor/líder)
- **Pessoas**: Pessoas · Visitantes · Famílias · Indicadores
- **Comunidade**: {termo da igreja} · Redes · Materiais · Saúde (Premium)
- **Cultos e serviço**: Celebrações · Escalas · Ministérios · Repertório · Modelos
- **Comunicação**: Publicações · Eventos · Destaques do app · Notificações · Públicos
- **Financeiro**: Visão geral · Lançamentos · Doações · Relatórios · Conciliação · Exportação · Cadastros
- **Administração**: Igreja e congregações · Usuários e papéis · Identidade e domínio · Plano e assinatura · Privacidade (LGPD) · Auditoria

Telas detalhadas: Início por papel, lista e página da pessoa (seções com âncora), lista e página do grupo (abas: visão geral, membros, encontros, materiais, oração, chat, pedidos de visita, ausências, árvore), Materiais, Celebrações e página da celebração (OC, setlist, escala), Escalas por período, Publicações e editor com prévia do app, as 7 sub-áreas do Financeiro e as 6 da Administração. As demais áreas aparecem como "escopo previsto".

**Domínios**: o painel da igreja fica em `{igreja}.orbien.app` (ou no domínio próprio). O console da plataforma Orbien fica em `admin.orbien.app` e não está neste pacote. A faixa vermelha de **sessão de suporte** aparece no painel da igreja quando a sessão é aberta pelo admin e não some enquanto ela estiver ativa.

Rotas sugeridas: `/pessoas/:id`, `/grupos/:id`, `/celebracoes/:id`, `/financeiro/{geral|lancamentos|doacoes|relatorios|conciliacao|exportacao|cadastros}`, `/admin/{igreja|usuarios|identidade|plano|lgpd|auditoria}`.

## App mobile: navegação
Abas: **Início · Conteúdo · Bíblia · {termo} · Mais**. Pilhas a partir de Mais: Minhas escalas (próximas, trocas, perfil de voluntário), Celebrações (OC com a minha função em destaque, setlist, equipe, modo ao vivo do Host), Contribuir (categoria, anônima/identificada, PIX; Starter = chave copia-e-cola, Premium = QR dinâmico + recorrente), Notificações (central + preferências), Perfil, Privacidade, e para a liderança: Cadastrar visitante (com deduplicação por telefone) e QR de autocadastro.

Início: hero com a publicação **marcada como destaque** (imagem, selo "Destaque", título, prazo; carrossel se houver mais de uma), depois blocos por papel (líder: encontro de hoje; líder de ministério: celebração do domingo; pastor: semáforo), minhas escalas, meus grupos e avisos.
Login: e-mail + senha, sem escolher igreja. Ao entrar, uma tela de transição aplica a cor e o logo da igreja. A biometria foi removida desta versão.

## Interações e regras
- **Estados obrigatórios** em toda tela: carregando (skeleton), vazio (ícone + título + texto + ação), erro (tentar de novo), sem acesso (cadeado). No app há também **sem conexão**.
- **Plano**: recurso Premium no Starter mostra um convite discreto ("Disponível no plano Premium" + "Conhecer o Premium") em vez de sumir. Itens do menu Premium ganham um ícone de coroa.
- **Papéis**: esconder a ação que o papel não pode fazer. O pastor vê financeiro só em totais. Contribuições na ficha da pessoa só com permissão financeira.
- **Terminologia**: célula/PG/GC vem da configuração da igreja e aparece em menus, títulos e notificações.
- **Presença (líder)**: todos vêm marcados como presentes, o líder toca para desmarcar. Se o envio falhar, as marcações são mantidas.
- **QR de check-in**: vale 4h e pode ser gerado até 24h após o encontro.
- **Exclusão de conta**: anonimização em 30 dias, cancelável.
- Transições: fade + translateY(3px), 180ms ease-out. Entrada do hero do site: escalonada (100/250/400/550ms), 900ms `cubic-bezier(.2,.7,.2,1)`.

## Assets
Sem imagens finais. Áreas listradas marcam onde entra imagem (foto da célula, capa de publicação, logo da igreja). Ícones são traço de 1.6px no estilo Lucide: use a biblioteca de ícones do codebase. Fontes: Google Fonts (Instrument Serif, Geist, Geist Mono).

## Files
- `site/*.html` + `site/site-orbita.css`: site v2. O CSS sobrepõe as variáveis e classes existentes (`--bg`, `--ink`, `.btn-primary`, `.eyebrow`, `.hero-bg`, `.section-title`, `.accent`).
- `produto/Orbien Painel Web v2.html`: painel. Telas em `proto/web-shell.jsx` (shell, nav, início), `web-pessoas.jsx` (pessoas, grupos, materiais), `web-cultos.jsx` (celebrações, escalas, publicações), `web-fin-admin.jsx` (financeiro, administração).
- `produto/Orbien App Mobile v2.html`: app. Telas em `proto/app-shell.jsx` (login, início, mais, notificações), `app-screens.jsx` (conteúdo, Bíblia, célula, presença, QR), `app-screens2.jsx` (escalas, celebração, doar, perfil, LGPD, visitante).
- `proto/base.css` + `proto/orbita.css`: tokens e componentes base. `orbita.css` é a camada v2.

## Screenshots
`screenshots/` traz capturas de referência do site (home inteira + topo de cada página), do painel (papel Pastor, plano Premium, tema escuro) e do app (papel Líder de célula). São só referência visual: a fonte de verdade são os HTML e este README.
