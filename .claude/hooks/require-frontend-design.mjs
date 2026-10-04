#!/usr/bin/env node
/**
 * PreToolUse: toda edição nos fronts passa pela skill `frontend-design`.
 *
 * Bloqueia Edit/Write/MultiEdit/NotebookEdit em apps/{web,site,admin,mobile}/
 * enquanto a skill não tiver sido carregada na sessão — pela ferramenta Skill
 * ou pelo usuário com /frontend-design. Carregou uma vez, vale para a sessão.
 *
 * A prova vem do transcript, lido como JSONL: um grep cru por
 * "frontend-design" sempre acertaria, porque a listagem de skills disponíveis
 * também vai para o transcript.
 *
 * Em subagente, o transcript dele é outro arquivo; olhamos os dois, para que
 * um subagente que carregou a skill não fique preso.
 */

import { readFileSync, existsSync } from "node:fs";
import { relative, isAbsolute, resolve } from "node:path";

const SKILL = "frontend-design";
// Em qualquer ponto do caminho, não só na raiz: uma worktree
// (`.claude/worktrees/<nome>/apps/web/...`) é o mesmo front.
const FRONT = /(^|\/)apps\/(web|site|admin|mobile)\//;

let input;
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch {
  process.exit(0); // entrada ilegível: não é este hook que vai travar a sessão
}

const ti = input.tool_input ?? {};
const target = ti.file_path ?? ti.notebook_path;
if (!target) process.exit(0);

const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
const rel = relative(root, isAbsolute(target) ? target : resolve(root, target)).split("\\").join("/");
if (!FRONT.test(rel)) process.exit(0);

function skillLoaded(path) {
  if (!path || !existsSync(path)) return false;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.includes(SKILL)) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const content = entry?.message?.content;
    if (entry.type === "assistant" && Array.isArray(content)) {
      if (content.some((c) => c?.type === "tool_use" && c.name === "Skill" && c.input?.skill === SKILL)) return true;
    }
    if (entry.type === "user") {
      const text = typeof content === "string" ? content : Array.isArray(content) ? content.map((c) => c?.text ?? "").join("") : "";
      if (text.includes(`<command-name>/${SKILL}</command-name>`)) return true;
    }
  }
  return false;
}

if (skillLoaded(input.transcript_path) || skillLoaded(input.agent_transcript_path)) process.exit(0);

console.log(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason:
        `Demanda de front (${rel}) passa pela skill \`${SKILL}\` antes de qualquer edição — regra do CLAUDE.md. ` +
        `Carregue-a com a ferramenta Skill (skill: "${SKILL}"), aplique-a tendo o design system do app como brief e tente a edição de novo.`,
    },
  })
);
