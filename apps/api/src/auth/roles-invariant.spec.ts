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

/**
 * Papel citado em controller tem que existir na tabela `roles`.
 *
 * O `RolesGuard` compara o literal com `user.roles`, que vem de
 * `role_assignments` — ou seja, com o **código** do papel. Um literal que não é
 * código nenhum não casa com ninguém e a rota fica fechada para todos os
 * papéis daquela lista, em silêncio: o guard nega, e negar é o que ele faz o
 * dia inteiro.
 *
 * Foi o que aconteceu com `'tesoureiro'` (o nome em português, não o código)
 * em `DRE_ROLES` e `EXPORT_ROLES`: o tesoureiro de verdade — `treasurer` —
 * levava 403 no DRE e na exportação financeira, e no `isPastor` do DRE um
 * pastor que também é tesoureiro era tratado como pastor restrito. Nenhum
 * teste de rota pegaria, porque cada um testa o que foi escrito.
 */
const ROLE_CODES = new Set([
  'platform_support',
  'tenant_admin',
  'admin_congregation',
  'pastor',
  'secretary',
  'treasurer',
  'cell_leader',
  'ministry_leader',
  'volunteer',
  'member',
]);

/**
 * Sem exceções. Havia uma — `'leader'` em `MATERIALIZE_ROLES` — e ela foi
 * corrigida em vez de tolerada; se alguma voltar a ser necessária, ela vem com
 * o motivo escrito e com teste que cobra sua remoção quando o motivo acabar.
 * Exceção que sobrevive ao próprio motivo é como um invariante apodrece.
 */

describe('Invariante: papel citado em controller existe na tabela `roles`', () => {
  const controllerFiles = findControllerFiles(SRC_ROOT);

  it('a lista de códigos acompanha o seed', () => {
    // Se `prisma/seed.ts` ganhar um papel, esta lista precisa ganhar também —
    // senão o invariante passa a acusar papel legítimo.
    const seed = readFileSync(join(SRC_ROOT, '..', 'prisma', 'seed.ts'), 'utf-8');
    const codes = [...seed.matchAll(/\{ code: '([a-z_]+)'/g)].map((m) => m[1]);

    expect(codes.length).toBeGreaterThan(0);
    expect(new Set(codes)).toEqual(ROLE_CODES);
  });

  it.each(controllerFiles.map((f) => [relative(SRC_ROOT, f), f] as const))(
    '%s só cita papéis que existem',
    (_relPath, fullPath) => {
      const source = readFileSync(fullPath, 'utf-8');

      // Os papéis chegam ao guard por dois caminhos, e os dois são varridos:
      // a constante (`const X_ROLES = [...]`, com ou sem spread de outra) e o
      // `@Roles(...)` inline. Só o que está dentro deles conta — varrer todos
      // os literais do arquivo tropeçaria em rota, chave de DTO e mensagem.
      const roleLists = [
        ...source.matchAll(/const\s+\w*ROLES\b[^=]*=\s*\[([^\]]*)\]/g),
        ...source.matchAll(/@Roles\(([^)]*)\)/g),
      ];

      for (const [, body] of roleLists) {
        for (const [, role] of body!.matchAll(/'([^']+)'/g)) {
          expect(ROLE_CODES.has(role!)).toBe(true);
        }
      }
    },
  );
});
