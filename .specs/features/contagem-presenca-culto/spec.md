# Contagem de presença por culto (PRES) — Specification

## Problem Statement

A igreja não tem registro de quantas pessoas vieram a cada culto. `AttendanceRecord`
existe só para encontros de pequeno grupo (check-in por QR). Quem está na escala do
culto é quem vê o público, mas não tem onde lançar o número; e a liderança não tem
média de presença por tipo de público para acompanhar crescimento.

## Goals

- [ ] Quem está escalado no ministério responsável lança, no web e no mobile, a contagem
      do culto em quatro categorias: crianças, membros, frequentadores, visitantes.
- [ ] A liderança vê no web a média de presença dos cultos (total e por categoria) num período.

## Out of Scope

| Feature | Reason |
|---|---|
| Presença nominal (quem veio) | Aqui é número agregado; check-in nominal é outro caso de uso |
| Meta/alerta de queda de presença | Extensão futura |
| Exportar relatório (PDF/CSV) | Extensão futura |
| Gráfico no mobile | Pedido é média só no web |

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
|---|---|---|---|
| Janela de lançamento | A partir do dia do culto (fuso da congregação), sem limite depois | Resposta do usuário | y |
| Quem lança | Só escalado (atribuição `pending`/`confirmed`, nunca `declined`/`swapped`) em ministério marcado como "responsável pela contagem" naquela congregação | Resposta do usuário ("só um ministério responsável") | y |
| Como marcar o ministério | Campo novo `Ministry.counts_attendance` (bool, default false), editado em Ministérios no web | Reusa a entidade existente; sem tabela de configuração | n |
| Quem mais lança/corrige | `tenant_admin`, `admin_congregation`, `pastor`, `secretary` (mesmo `WRITE_ROLES` das instâncias) | Correção pela liderança sem depender da escala | n |
| Uma contagem por culto | 1 registro por `CelebrationInstance`; último a salvar vale; guarda `updated_by` e hora | Sem contagem duplicada nem soma de lançamentos | y (parcial) |
| Categorias | Independentes; total = soma das quatro | Resposta do usuário | y |
| Limites | Inteiros 0–100000 cada; zero é válido, vazio não | Evita lixo; "0 visitantes" é informação | n |
| Culto cancelado | Não aceita lançamento (422) e fica fora da média | Cancelado não teve público | n |
| Média | Média simples por culto = soma ÷ nº de cultos **com contagem lançada** no filtro; culto sem contagem não entra (não conta como zero) | Zero falso derruba a média | n |
| Filtros da média | Período (padrão: 90 dias), celebração (nome/tipo), congregação (RLS já recorta; admin multi-congregação vê a atual) | Reusa `period.ts` do web | n |
| Plano | `premium`, como o restante de celebrações (`@RequiresPlan('premium')`) | Escala/celebração já é premium | n |
| Sessão de suporte | Pode ler; `AuditInterceptor` registra | Regra global do monorepo | y |

**Open questions:** nenhuma sem default registrado. Linhas `n` seguem se o usuário não discordar.

## User Stories

### P1: Lançar a contagem do culto ⭐ MVP

**User Story**: Como escalado no ministério responsável, quero informar quantas crianças,
membros, frequentadores e visitantes vieram ao culto, no celular ou no web.

**Acceptance Criteria**:
1. WHEN escalado elegível envia as 4 contagens de um culto cujo dia chegou THEN o sistema SHALL gravar uma contagem única da instância e devolver os valores e o total.
2. WHEN a instância já tem contagem THEN o sistema SHALL substituí-la (upsert) e atualizar `updated_by`/`updated_at`.
3. WHEN o dia do culto ainda não chegou THEN o sistema SHALL responder 422 com mensagem clara.
4. WHEN a pessoa não está escalada no ministério responsável (ou está `declined`/`swapped`) e não é papel de liderança THEN o sistema SHALL responder 403.
5. WHEN algum valor é negativo, não inteiro, ausente ou > 100000 THEN o sistema SHALL responder 400.
6. WHEN o culto está `cancelled` THEN o sistema SHALL responder 422.
7. WHEN `GET /volunteers/my-celebration-assignments` é consultado THEN cada item SHALL trazer `attendance` (contagem atual ou null) e `can_count_attendance` (bool), para o front decidir se mostra o botão.
8. WHEN o mobile abre a escala/celebração de um item com `can_count_attendance` THEN o app SHALL mostrar o formulário (4 campos numéricos, total ao vivo) e salvar; sem permissão SHALL mostrar a contagem só leitura, se houver.
9. WHEN o web abre a celebração (detalhe) THEN SHALL mostrar o mesmo formulário para escalado elegível ou liderança.

**Independent Test**: com tenant `teste1-church`, escalar usuário no ministério marcado, lançar 10/50/8/4 e reler: total 72.

### P1: Média de presença no web ⭐ MVP

**User Story**: Como pastor/admin, quero ver a média de presença dos cultos, por categoria.

**Acceptance Criteria**:
1. WHEN abre a visão com período THEN o sistema SHALL mostrar nº de cultos contados, média de total, crianças, membros, frequentadores e visitantes (1 casa decimal) e os totais acumulados de cada categoria.
2. WHEN nenhum culto no filtro tem contagem THEN SHALL mostrar estado vazio, nunca "0".
3. WHEN filtra por celebração THEN SHALL recalcular só com ela.
4. WHEN papel sem leitura (`member`, `volunteer`) acessa THEN a API SHALL responder 403 e o menu não SHALL exibir o item.

### P2: Série por culto

**User Story**: Como pastor, quero ver a lista dos cultos do período com a contagem de cada um, para enxergar a oscilação.

**Acceptance Criteria**:
1. WHEN a visão carrega THEN SHALL listar cultos (data, nome, 4 categorias, total) em ordem decrescente, marcando "sem contagem" nos que passaram sem lançamento.
2. WHEN liderança clica numa linha THEN SHALL poder corrigir a contagem.

## Edge Cases

- Dois escalados salvam ao mesmo tempo: upsert em `celebration_instance_id` único; ganha o último, sem erro 500.
- Congregação com fuso diferente: "dia do culto" usa `Congregation.timezone`.
- Ministério deixa de ser responsável depois do lançamento: contagem existente permanece.
- Instância apagada: contagem some em cascata.

## Requirement Traceability

| ID | Story | Status |
|---|---|---|
| PRES-01 | Modelo + RLS (`celebration_attendance`) | Pending |
| PRES-02 | `PUT /celebrations/instances/:id/attendance` (AC1–6) | Pending |
| PRES-03 | Flag `Ministry.counts_attendance` + edição no web | Pending |
| PRES-04 | `attendance`/`can_count_attendance` em my-assignments (AC7) | Pending |
| PRES-05 | Mobile: formulário (AC8) | Pending |
| PRES-06 | Web: formulário no detalhe da celebração (AC9) | Pending |
| PRES-07 | `GET /celebrations/attendance/summary` + tela de média (P1 média) | Pending |
| PRES-08 | Lista por culto + correção (P2) | Pending |

## Success Criteria

- [ ] Contagem lançada no mobile aparece no web e vice-versa.
- [ ] Média confere com cálculo manual sobre 3 cultos de teste.
- [ ] Teste de RLS: tenant B não lê nem grava contagem do tenant A.
