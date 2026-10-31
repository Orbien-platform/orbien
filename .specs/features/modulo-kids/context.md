# Módulo Kids Context

**Gathered:** 2026-10-22
**Spec:** `.specs/features/modulo-kids/spec.md`
**Status:** Spec confirmada em 2026-10-26; Design e Tasks atualizados

---

## Feature Boundary

Ministério infantil dentro do Orbien: turmas por faixa etária, abertura de uma ou
mais **sessões kids** por culto (0..N), cadastro de criança com responsáveis e
consentimento, check-in/check-out seguro com etiqueta e QR, e escala de
voluntários kids com contagem derivada.

---

## Implementation Decisions

### Modelo (decidido)

- A celebração (`CelebrationInstance`) **pode não ter** culto kids (0 sessões),
  ter **uma** (turma única) ou **várias** (uma por faixa etária).
- A turma (`KidsRoom`) é catálogo da congregação (nome, faixa etária, capacidade);
  a sessão (`KidsSession`) liga **instância + turma**.
- Cadência: uma sessão por turma por instância (único `instance_id + room_id`).

### Escopo do MVP (decidido) — os quatro blocos entram

1. Turmas + sessões por culto
2. Cadastro de criança + responsáveis
3. Check-in/out com etiqueta e QR
4. Escala de voluntários kids + contagem

### LGPD (decidido)

- Responsável cadastra/autoriza a criança no app, com consentimento específico
  (LGPD Art. 14). Igreja é controladora. Exclusão em até 30 dias após o
  cancelamento do contrato já está no contrato (cláusula "cadastros infantis").

### Decisões de 2026-10-26 (dono do produto)

- Faixa etária obrigatória na criação da turma, cada turma com a sua.
- Cada turma diz se aceita criança fora da faixa: aceita → aviso e confirmação; não aceita → recusa com "fora da faixa etária da turma".
- Todo check-in tem responsável pela entrada (quem entrega) e quem recebe na turma.
- Terceiro autorizado, dados sensíveis, escala e quem gerencia: como proposto.
- Check-in/out só por código; QR anotado para o futuro.
- Capacidade não bloqueia; contagem vem do check-in e pode ser editada.
- Plano premium.
- Anonimização do registro não ocorre enquanto o responsável pelo check-in for membro ativo.

### Pesquisa de concorrentes (resultado)

- Dono do produto: **a Doca não usa módulo kids hoje** (tem uma turma infantil
  regular, deve passar a duas; outras igrejas têm N turmas). Logo não há dor
  validada em Eklesia/inChurch/InPeace para copiar.
- Busca pública não achou funcionalidade kids documentada dos três. O que existe
  de benchmark aberto: My Kids (DB1) e Planning Center Check-Ins — check-in/out,
  etiqueta para criança e responsável com código casado, alergias/observações.
- Consequência: o desenho parte do **uso real do cliente zero** e de práticas
  conhecidas de segurança infantil, não de paridade com concorrente.

### Agent's Discretion

- Layout das telas, nomes finais de rota e campos de etiqueta (na fase Design).

### Declined / Undiscussed Gray Areas → Assumptions

Ver tabela "Assumptions & Open Questions" na spec.

---

## Specific References

- `CelebrationAttendance.children` (PROD-37): contagem agregada que já existe.
- `Household` / `HouseholdMember(role=child)`, `Person.birth_date`, `ConsentRecord`.
- `CelebrationSchedule` → `CelebrationMinistry` → `CelebrationAssignment`: escala.
- `QrToken` / `MeetingCheckinToken`: padrões de QR já usados.

---

## Deferred Ideas

- Check-in e check-out por QR (o código já fica gravado por check-in).
- Reconhecimento facial no check-in; pulseira térmica própria.
- Currículo/lição por turma, galeria de fotos, comunicação com pais por WhatsApp.
- Cobrança de evento kids (passaria pelo montador Asaas com split).
