---
name: fillsd
description: >-
  Spec-driven em 4 fases adaptativas (Specify, Design, Tasks, Execute), com auto-sizing
  por complexidade, tarefas atômicas, rastreabilidade de requisitos e verificação por
  agente independente (autor ≠ verificador, evidence-or-zero). Use para planejar ou
  implementar feature com verificação, ou validar implementação contra a spec.
  Triggers: "specify", "fillsd", "spec-driven", "design", "tasks", "validate", "verify",
  "record decision", "pause work", "resume work". NÃO use para mudança pequena e óbvia
  — o custo de contexto não se paga.
license: CC-BY-4.0
metadata:
  author: Fill
  version: 1.0.0
---

# Fill Spec Driven (fillsd)

Fluxo de Feature Leading da Engenharia Fill: da issue (intenção do PO) à entrega verificada.

Planeje e implemente com precisão. Tarefas granulares. Dependências claras. Ferramentas certas. Zero cerimônia.

```
┌──────────┐   ┌──────────┐   ┌─────────┐   ┌─────────┐
│ SPECIFY  │ → │  DESIGN  │ → │  TASKS  │ → │ EXECUTE │
└──────────┘   └──────────┘   └─────────┘   └─────────┘
   required      optional*      optional*     required

* O agente pula quando o escopo não precisa
```

## Contexto Fill

- **Entrada:** o pedido do usuário. Não há issue tracker — o quê / por quê / critérios de aceite saem da conversa e viram `spec.md`. Se algo essencial não foi dito, pergunte em vez de assumir.
- **Skill irmã:** `pull-request` (redigir PR após Execute).
- **Fontes no repo:** `CLAUDE.md` da raiz e `apps/*/AGENTS.md` (convenções), `DEPLOY.md`, `docs/MONOREPO.md`, `docs/CI.md`, e `.specs/` quando já existir.
- **Idioma:** português, inclusive nas mensagens de commit — é o padrão do histórico deste repositório. Convenções de commit ficam no `CLAUDE.md`, não aqui.

## Critical Rules (leia antes de agir)

**Carregar arquivos desta skill.** Referências ficam em `references/` no diretório desta skill (onde está este `SKILL.md`). Resolva caminhos relativos a esse diretório — nunca à raiz do workspace — e carregue pelo nome da skill ativa; nunca assuma path de instalação fixo. Quando um passo pedir para ler uma referência, **leia por completo (até EOF)** antes de agir — nunca aja com leitura parcial/truncada.

**Contrato de execução — toda tarefa, inegociável (vale mesmo sem abrir as referências):**

1. Testes derivam dos critérios de aceite da spec e afirmam outcomes definidos na spec — nunca espelham a implementação.
2. O gate precisa passar (testes passam) antes da tarefa estar done — o test runner decide, não autoavaliação.
3. Um commit atômico por tarefa. Nunca agrupe tarefas; nunca enfraqueça, pule ou delete testes para fazê-los passar.
4. Após a **última** tarefa, um **Verifier fresco roda sempre automaticamente** (autor ≠ verificador) — checagem ancorada na spec + discrimination sensor. Nunca é opcional nem pedida. Ver Sub-Agent Delegation.

**Antes do Execute:** leia [implement.md](references/implement.md) por completo; se um `tasks.md` formal empacota em mais de um batch orçado (> ~8 tarefas), apresente a oferta de sub-agentes primeiro (ver Sub-Agent Delegation).

## Auto-Sizing: princípio central

**A complexidade define a profundidade, não um pipeline fixo.** Antes de qualquer feature, avalie o escopo e aplique só o necessário:

| Escopo      | O quê                    | Specify                                                 | Design                                          | Tasks                         | Execute                                               |
| ----------- | ------------------------ | ------------------------------------------------------- | ----------------------------------------------- | ----------------------------- | ----------------------------------------------------- |
| **Small**   | ≤3 arquivos, uma frase   | Spec one-liner (inline)                                 | Skip                                            | Skip                          | Implementar + verificar inline                        |
| **Medium**  | Feature clara, <10 tasks | Spec (brief)                                            | Skip — design inline                            | Skip — tasks implícitas       | Implementar + verificar                               |
| **Large**   | Multi-componente         | Spec completa + IDs de requisito                        | Arquitetura + componentes                       | Breakdown + dependências      | Implementar + verificar por tarefa                    |
| **Complex** | Ambiguity, domínio novo  | Spec completa + [discutir gray areas](references/discuss.md) | [Research](references/design.md) + arquitetura | Breakdown + plano de fases    | Implementar + [UAT interativo](references/validate.md) |

**Regras:**

- **Specify e Execute são sempre obrigatórios** — sempre precisa saber O QUÊ e FAZER
- **Design é pulado** quando a mudança é direta (sem decisões arquiteturais, sem padrões novos)
- **Tasks é pulado** quando há ≤3 passos óbvios (ficam implícitos no Execute)
- **Discuss dispara dentro de Specify** quando há gray areas ambíguas ou dimensões implícitas (persistência/estado, calls externas, auth, payments, concorrência, transições de estado)
- **UAT interativo dispara no Execute** só para features user-facing com comportamento complexo

**Safety valve:** Mesmo quando Tasks é pulado, Execute SEMPRE começa listando passos atômicos inline (ver [implement.md](references/implement.md)). Se a listagem revelar >5 passos ou dependências complexas, PARE e crie um `tasks.md` formal — a fase Tasks foi pulada indevidamente.

## Estrutura `.specs`

```
.specs/
├── STATE.md            # Log de decisões do projeto (AD-NNN, append-only)
├── LESSONS.md          # Playbook de lições (renderizado pelo script de lições — não editar à mão)
├── lessons.json        # Estado canônico das lições (machine-owned)
└── features/           # Specs por feature
    └── [feature]/
        ├── spec.md         # Requisitos com IDs rastreáveis
        ├── context.md      # Decisões do usuário em gray areas (só se discuss disparar)
        ├── design.md       # Arquitetura & componentes (só Large/Complex)
        ├── tasks.md        # Tarefas atômicas com verificação (só Large/Complex)
        └── validation.md   # Relatório do Verifier: PASS/FAIL, evidência por AC, sensor, diff range
```

## Workflow

**Feature nova:**

1. Carregar issue (se houver) + contexto do repo → Specify → (Design) → (Tasks) → Execute (profundidade auto-sized)
2. Após Execute com PASS: oferecer redação de PR via skill `pull-request` quando o usuário for abrir PR

**Retomar trabalho:**

Leia `.specs/STATE.md` para reconfirmar as constraints ativas, depois proponha o próximo passo.

## Context Loading Strategy

**Carga sob demanda (só o que a tarefa atual precisa):**

- `.specs/STATE.md` — Decisions: ler no Design, reler ao retomar
- lições confirmadas — carregar em Specify e Design via `python3 .claude/skills/fillsd/scripts/lessons.py list --status confirmed` ([lessons.md](references/lessons.md)); só `confirmed`, nunca candidates
- spec.md / context.md / design.md / tasks.md conforme a fase

**Nunca carregar ao mesmo tempo:**

- Múltiplas specs de features
- Múltiplos docs de arquitetura

**Target:** <40k tokens de contexto total  
**Reserve:** 160k+ tokens para trabalho, raciocínio, outputs  
**Monitoring:** Exibir status quando >40k (ver [context-limits.md](references/context-limits.md))

## Sub-Agent Delegation

**Trigger:** conte o total de tasks. Se a feature empacota em mais de um batch orçado (> ~8 tasks) → oferecer sub-agentes; se cabe num batch (≤ ~8) → executar inline.

**Offer-then-confirm** — nunca auto-spawn. O usuário precisa aceitar antes de despachar qualquer sub-agente.

**Despacho de workers:** agrupe por **fase inteira** — nunca parta uma fase entre workers, porque dependência é intra-fase. Fases independentes entre si podem ir em paralelo (o harness despacha subagentes concorrentes; use uma mensagem com várias chamadas). Fases dependentes vão em sequência. Cada worker executa suas tasks em ordem (implement → gate → commit) e devolve resumo compacto. Worker não despacha outro worker.

**Verifier (always-on, never prompted):** Após a última task commitada, o orquestrador despacha um Verifier fresco automaticamente — independente da contagem de fases. Validação nunca pede prompt; é o fechamento do Execute. **Autor ≠ verificador**: o Verifier re-deriva cobertura com evidence-or-zero; não herda o modelo mental do autor. O Verifier: (1) **checagem ancorada na spec**; (2) **discrimination sensor**; (3) escreve `.specs/features/[feature]/validation.md`; (4) devolve veredito + gaps ranqueados; gaps viram fix tasks (loop ≤ 3 iterações); (5) **destila lições** via `.claude/skills/fillsd/scripts/lessons.py` (PASS limpo não grava nada — ver [lessons.md](references/lessons.md)).

**Fallback standalone:** Sem sub-agentes, rode `validate.md` como pass independente fresh-eyes após o commit final — incluindo checagem ancorada na spec e discrimination sensor.

Mecânica completa: [sub-agents.md](references/sub-agents.md).

## Commands

**Feature-level (auto-sized):**

| Trigger Pattern | Reference |
|----------------|-----------|
| Specify feature, definir requisitos, puxar issue | [specify.md](references/specify.md) |
| Discuss feature, capturar contexto, como deve funcionar | [discuss.md](references/discuss.md) |
| Design feature, arquitetura | [design.md](references/design.md) |
| Break into tasks, criar tasks | [tasks.md](references/tasks.md) |
| Implement task, build, execute | [implement.md](references/implement.md) |
| Validate, verify, test, UAT | [validate.md](references/validate.md) |

**Memory:**

| Trigger Pattern | Reference |
|----------------|-----------|
| Record decision, decisão de projeto | [memory.md](references/memory.md) |
| Pause work, end session | [memory.md](references/memory.md) |
| Resume work, continue | [memory.md](references/memory.md) |
| Load lessons, aplicar lições | [lessons.md](references/lessons.md) |
| Record lesson (auto após validation) | [lessons.md](references/lessons.md) |

## Knowledge Verification Chain

Ao pesquisar, desenhar ou decidir tecnicamente, siga esta cadeia na ordem. Nunca pule passos.

```
Step 1: Codebase → código, convenções e padrões já em uso
Step 2: Docs do projeto → `CLAUDE.md`, `apps/*/AGENTS.md`, `DEPLOY.md`, `docs/`, `.specs/STATE.md` (Decisions)
Step 3: `node_modules/<lib>/dist/docs/` quando existir → o Next 16 traz os docs dele aí, e `apps/web/AGENTS.md` manda consultar antes de escrever código
Step 4: Web search → docs oficiais
Step 5: Marcar como incerto → "não tenho certeza sobre X; verifique"
```

Nunca salte para o Step 5 com 1–4 disponíveis, e **nunca fabrique** API ou padrão:
inventar assinatura causa falha em cascata. Incerteza é melhor que invenção.
