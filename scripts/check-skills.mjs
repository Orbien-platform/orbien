#!/usr/bin/env node
/**
 * Sanidade das skills em .claude/skills/.
 *
 * O modo de falha de uma skill é não ser acionada — frontmatter quebrado não
 * dá erro em lugar nenhum, a skill só nunca aparece. Daí a checagem.
 *
 * Uso: node scripts/check-skills.mjs
 */

import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SKILLS = join(ROOT, ".claude/skills");

const problems = [];

if (!existsSync(SKILLS)) {
  console.log("Nenhuma skill em .claude/skills/ — nada a verificar.");
  process.exit(0);
}

for (const dir of readdirSync(SKILLS)) {
  const skillDir = join(SKILLS, dir);
  if (!statSync(skillDir).isDirectory()) continue;

  const file = join(skillDir, "SKILL.md");
  if (!existsSync(file)) {
    problems.push(`${dir}: falta SKILL.md`);
    continue;
  }

  const content = readFileSync(file, "utf8");
  const fm = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) {
    problems.push(`${dir}/SKILL.md: sem frontmatter delimitado por ---`);
    continue;
  }

  const name = fm[1].match(/^name:\s*(.+)$/m)?.[1]?.trim();
  const description = fm[1].match(/^description:\s*(.+)$/m)?.[1]?.trim();

  if (!name) problems.push(`${dir}/SKILL.md: frontmatter sem 'name'`);
  else if (name !== dir) problems.push(`${dir}/SKILL.md: name '${name}' difere da pasta '${dir}'`);

  if (!description) problems.push(`${dir}/SKILL.md: frontmatter sem 'description'`);

  // Caminho citado que não existe mais é a forma mais comum de uma skill
  // importada de outro projeto enganar. Só checamos caminho ancorado na raiz
  // (`apps/…`, `docs/…`), porque caminho relativo a um app — `src/lib/api.ts`
  // — é legítimo e resolveria em vários lugares.
  const ANCHORED = /^(apps|docs|scripts|\.claude|\.github)\//;
  const referenced = new Set(
    [...content.matchAll(/`([a-zA-Z0-9_./-]+\.(?:md|ts|tsx|js|mjs|sql|json|sh|yml))`/g)].map((m) => m[1])
  );
  for (const ref of referenced) {
    if (!ANCHORED.test(ref)) continue;
    if (!existsSync(join(ROOT, ref)) && !existsSync(join(skillDir, ref))) {
      problems.push(`${dir}/SKILL.md: referencia '${ref}', que não existe`);
    }
  }
}

if (problems.length === 0) {
  console.log("✓ skills consistentes");
  process.exit(0);
}
console.error("Problemas nas skills:");
for (const p of problems) console.error(`  - ${p}`);
process.exit(1);
