# Memory Layer

**File:** `.specs/STATE.md`

A single file with two section-scoped parts. Each section has its own lifecycle; writes are always targeted — never whole-file overwrites.

---

## Sections

### `## Decisions` — append-only log

Records **project-level** decisions only: conventions, patterns, constraints, or cross-cutting technology choices that future features must follow or supersede.

**Not project-level → stays in the feature's `design.md` Tech Decisions table.**  
Heuristic: would a different feature need to know about this? If yes → project-level. If no → feature-local.

**Format** (one entry per decision):

```markdown
## Decisions

### AD-001
- **Decision**: [what was decided — one sentence]
- **Reason**: [why this option was chosen]
- **Trade-off**: [what was given up]
- **Scope**: [which features / packages / layers this governs]
- **Date**: YYYY-MM-DD
- **Status**: active | superseded by AD-NNN
```

**Supersession rule:** When a new decision replaces an old one, append a new `AD-NNN` entry and update the old entry's `status` field to `superseded by AD-NNN`. Never delete old entries — the history is the audit trail.

---

## File shape

```markdown
# STATE

## Decisions

[AD-NNN entries…]

[latest snapshot…]
```

If the file does not yet exist, create it with both section headers and empty bodies.

---

## Read / Write Triggers

| Trigger | Section | Operation |
| ------- | ------- | --------- |
| Design phase, Step 1 (Load Context) | `## Decisions` | **Read** — conform to active decisions or supersede |
| Design phase, Tech Decisions step | `## Decisions` | **Append** — only for project-level decisions |

---

## Regra de escrita (crítica)

O log é **append-only**. Nunca reescreva, reordene nem remova entrada existente:
a única forma de contrariar uma decisão ativa é registrar uma nova que a
supersede, marcando a antiga. Reescrever o arquivo inteiro perde decisões em
silêncio — localize o fim do log e acrescente ali.

---

## AD-NNN numbering

- Numbers are sequential, project-scoped, and permanent — never reused.
- The counter starts at `AD-001`. Check existing entries before assigning the next number.
- If `.specs/STATE.md` does not exist, the first decision is `AD-001`.
