# Sub-Agent Delegation

Full mechanics for phase-batch workers and the Verifier sub-agent used during Execute.

## Despacho de workers

O harness já cuida da mecânica de subagente. Aqui valem só duas regras de
agrupamento, que são do domínio da skill e não do harness:

1. **Fase é a unidade indivisível.** Nunca parta uma fase entre workers —
   dependência é intra-fase, e partir gera trabalho pela metade.
2. **Fases independentes vão em paralelo**, numa mensagem com várias chamadas;
   fases dependentes vão em sequência. Worker não despacha outro worker.

Cada worker devolve resumo compacto: tasks concluídas, gates, o que falhou.

## Verifier Sub-Agent

**Always-on, never prompted — one per feature completion.** The Verifier is a separate role from the batch worker. It runs once — after the last task of the feature is committed — as an independent quality gate, dispatched automatically by the orchestrator. It is **not** gated behind the batching offer; it always runs. Do NOT ask the user whether to run validation; it is mandatory.

**Author ≠ verifier:** The agent (or batch worker) that wrote the code and tests is the author. The Verifier is a fresh sub-agent dispatched by the orchestrator after the final commit. It does not inherit the author's context, mental model, or assumptions. This separation is what makes the gate trustworthy.

**What the Verifier receives:**
- `spec.md` for the feature (ACs = source of truth)
- The git diff surface for the feature (scoped to the feature branch or commit range)
- The test files in scope
- `references/validate.md` as its operating checklist

**What the Verifier does (full process in `validate.md`):**
1. **Spec-anchored coverage check** — re-derives coverage evidence-or-zero: every AC traced to `file:line` + assertion expression. For each covered criterion, confirms the test's asserted value matches the **spec-defined expected outcome** (not just that an assertion exists). Where the spec does not define a precise outcome, flags a **spec-precision gap** rather than passing silently.
2. **Discrimination sensor** — injects a small behavior-level fault (flip a condition, change a return value, off-by-one, remove a required side effect) in a **scratch/throwaway state** (git worktree descartável ou cópia temporária — nunca `git stash`, que é global), runs the relevant tests, confirms they FAIL (kill the mutant), then discards the mutation. Tiered by risk: lightweight (1–3 mutations) for standard features; expanded (≥5 mutations or full mutation tooling) for P0/critical paths. Surviving mutants become fix tasks.
3. Applies the **payload/conjunction rule**: checks payload fields are asserted on value/state, not just that the call occurred.
4. **Writes the persisted report** to `.specs/features/[feature]/validation.md` — PASS/FAIL, per-AC evidence (`file:line` + assertion + spec outcome), sensor result (killed/survived per mutation), gate exit results, diff/commit range.
5. **Returns a compact verdict in chat** to the orchestrator.
6. Does **NOT** write, modify, or fix any code or tests — the real working tree is never mutated (sensor mutations run in scratch state only).

**What the Verifier reports back (compact chat format):**
```
## Validation: [feature name] — [PASS ✅ | FAIL ❌]

**Spec-anchored check**: [N/N ACs matched spec outcome | M spec-precision gaps flagged]
**Gate**: [X passed, 0 failed]
**Sensor**: [N mutations injected, N killed, N survived]
**Report**: `.specs/features/[feature]/validation.md`

**Ranked gaps** (if FAIL):
1. [Gap description] — [AC or criterion] — [file:line or "no evidence"]
2. ...
```

**Failure handling:** The orchestrator routes the ranked gaps to an implementer as fix tasks, then re-dispatches the Verifier. This fix→re-verify loop is bounded to a maximum of **3 iterations**. If gaps remain after 3 iterations, escalate to the user.

**Standalone fallback:** When running without sub-agents (a single agent executing the full feature), run `validate.md` as an independent fresh-eyes pass — re-read `spec.md` and the diff from scratch, apply evidence-or-zero, run the spec-anchored check and discrimination sensor, write the report file, and report PASS/FAIL before marking the feature done.
