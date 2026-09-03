/**
 * `RolesGuard` é fail-open por desenho: sem `@Roles`, a rota libera para
 * qualquer usuário autenticado (a autenticação em si fica com o
 * `JwtAuthGuard`). Isso está correto — mas é frágil: um controller novo sem
 * `@Roles` vira dado de igreja aberto para qualquer papel, e nenhum teste de
 * rota individual pegaria essa omissão, porque o teste de rota testa o que
 * foi escrito, não o que faltou escrever.
 *
 * Este teste varre `src/**\/*.controller.ts` e falha se algum controller não
 * usar `@Roles` em handler nenhum, fora da allowlist explícita abaixo. É
 * análise estática do texto-fonte, não instancia nada — o objetivo é pegar
 * a ausência da anotação, e ler o arquivo é mais direto que montar um
 * `ExecutionContext` por rota.
 */

import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

const SRC_ROOT = join(__dirname, '..');

/**
 * Controllers legitimamente públicos — sem `@Roles` em nenhum handler.
 * Adicionar um caminho aqui é uma decisão de produto, não um jeito de calar
 * o teste; cada linha precisa continuar correta.
 */
const ALLOWLIST = new Set([
  'app.controller.ts',
  'waitlist/waitlist.public.controller.ts',
  'visitor/visitor.public.controller.ts',
]);

function findControllerFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...findControllerFiles(full));
    } else if (entry.endsWith('.controller.ts') && !entry.endsWith('.spec.ts')) {
      files.push(full);
    }
  }
  return files;
}

describe('Invariante: todo controller usa @Roles, exceto a allowlist explícita', () => {
  const controllerFiles = findControllerFiles(SRC_ROOT);

  it('encontrou os controllers do projeto (a lista não está vazia)', () => {
    expect(controllerFiles.length).toBeGreaterThan(0);
  });

  it('todo caminho da allowlist ainda existe e é um controller de verdade', () => {
    const relPaths = new Set(controllerFiles.map((f) => relative(SRC_ROOT, f)));
    for (const allowed of ALLOWLIST) {
      expect(relPaths.has(allowed)).toBe(true);
    }
  });

  it.each(controllerFiles.map((f) => [relative(SRC_ROOT, f), f] as const))(
    '%s usa @Roles ou está na allowlist',
    (relPath, fullPath) => {
      if (ALLOWLIST.has(relPath)) return;

      const source = readFileSync(fullPath, 'utf-8');
      expect(source).toMatch(/@Roles\(/);
    },
  );
});
