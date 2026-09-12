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
import { PRODUCT_AREAS, PRODUCT_AREA_READ_ROLES } from './product-areas';

const SRC_ROOT = join(__dirname, '..');

/**
 * Controllers legitimamente sem `@Roles` em nenhum handler. Adicionar um
 * caminho aqui é uma decisão de produto, não um jeito de calar o teste; cada
 * linha precisa continuar correta. Duas razões distintas cabem aqui:
 *   - público de verdade, sem `JwtAuthGuard` (as três primeiras linhas);
 *   - autenticado, mas sobre a própria conta — sem operação administrativa
 *     nem papel "certo" para restringir (MOB-10, `notification-preferences`).
 */
const ALLOWLIST = new Set([
  'app.controller.ts',
  'waitlist/waitlist.public.controller.ts',
  'visitor/visitor.public.controller.ts',
  // `GET /me/permissions` responde sobre o próprio token de quem pergunta: a
  // resposta é derivada de `user.roles`, então não há papel a exigir — exigir
  // qualquer um deixaria de fora justamente quem não tem nenhum, que também
  // precisa saber que não enxerga nada. O `JwtAuthGuard` continua valendo.
  'auth/me.controller.ts',
  'content/notification-preferences.controller.ts',
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

/**
 * A lista canônica de áreas também cita papel — e a varredura de texto acima
 * não a alcança.
 *
 * `auth/product-areas.ts` guarda os papéis num objeto, não num
 * `const X_ROLES = [...]`, então o regex do invariante anterior passaria por
 * ela sem ler nada — e passaria em silêncio, que é o modo de falha que este
 * arquivo inteiro existe para evitar. Aqui a checagem é pelo módulo
 * importado, não pelo texto: não há regex para envelhecer.
 */
describe('Invariante: a lista canônica de áreas só cita papéis que existem', () => {
  it('toda área tem ao menos um papel, e todo papel existe na tabela `roles`', () => {
    expect(PRODUCT_AREAS.length).toBeGreaterThan(0);

    for (const area of PRODUCT_AREAS) {
      const roles = PRODUCT_AREA_READ_ROLES[area] as readonly string[];
      expect(roles.length).toBeGreaterThan(0);

      for (const role of roles) {
        expect(ROLE_CODES.has(role)).toBe(true);
      }
    }
  });

  it('nenhuma área abre leitura para `platform_support`', () => {
    // O suporte da plataforma não tem leitura permanente de dado de igreja: o
    // acesso dele é pontual, por `POST /auth/impersonate`, e aparece aqui como
    // `support_session`, não como papel. Ver o RolesGuard.
    for (const area of PRODUCT_AREAS) {
      expect(PRODUCT_AREA_READ_ROLES[area] as readonly string[]).not.toContain(
        'platform_support',
      );
    }
  });
});
