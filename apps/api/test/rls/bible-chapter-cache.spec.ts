/**
 * RLS — visibilidade compartilhada de `bible_chapter_cache` (AD-005,
 * .specs/STATE.md, biblia-nvi-marcacoes-mobile, BIB-01/BIB-02)
 *
 * O oposto de todos os outros specs deste diretório: `bible_chapter_cache` é
 * a primeira tabela do repo que nasce SEM isolamento por
 * tenant/congregação, de propósito — o texto de um capítulo da NVI é o mesmo
 * para toda igreja. `021_rls_bible_chapter_cache.sql` habilita RLS com uma
 * policy `USING (true) WITH CHECK (true)`, e este arquivo prova que essa
 * abertura é deliberada e testada, não uma lacuna de isolamento esquecida:
 * duas congregações/tenants DIFERENTES leem a MESMA linha de cache com
 * sucesso.
 *
 * `runAsTenantWithRole`, mesma forma como a produção roda (o
 * `TenantContextInterceptor` faz `SET LOCAL ROLE app_user` antes do
 * `set_config`) — mesmo a tabela não filtrando por tenant, a leitura
 * acontece como `app_user`, não como o `postgres` de `prismaAdmin`.
 */

import { prismaAdmin, runAsTenantWithRole } from '../helpers/rls';

const ts = Date.now();

let tenantAId: string;
let congAId: string;
let tenantBId: string;
let congBId: string;
let cacheRowId: string;

beforeAll(async () => {
  const tenantA = await prismaAdmin.tenant.create({
    data: { slug: `bib-cache-a-${ts}`, name: 'Tenant A (cache bíblia)' },
  });
  tenantAId = tenantA.id;
  congAId = (
    await prismaAdmin.congregation.create({ data: { tenant_id: tenantAId, name: 'A — Sede' } })
  ).id;

  const tenantB = await prismaAdmin.tenant.create({
    data: { slug: `bib-cache-b-${ts}`, name: 'Tenant B (cache bíblia)' },
  });
  tenantBId = tenantB.id;
  congBId = (
    await prismaAdmin.congregation.create({ data: { tenant_id: tenantBId, name: 'B — Sede' } })
  ).id;

  // Inserida via prismaAdmin (BYPASSRLS), sem tenant no registro — exatamente
  // como o design prevê: cache global, escrito pelo BibleReaderService sem
  // contexto de tenant fixado.
  const cacheRow = await prismaAdmin.bibleChapterCache.create({
    data: {
      version: `NVI-TEST-${ts}`,
      book_code: 'JHN',
      chapter: 3,
      verses: [{ number: 16, text: 'Porque Deus tanto amou o mundo...' }],
    },
  });
  cacheRowId = cacheRow.id;
}, 60_000);

afterAll(async () => {
  await prismaAdmin.bibleChapterCache.deleteMany({ where: { id: cacheRowId } });
  await prismaAdmin.congregation.deleteMany({ where: { tenant_id: { in: [tenantAId, tenantBId] } } });
  await prismaAdmin.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
  await prismaAdmin.$disconnect();
}, 30_000);

describe('bible_chapter_cache — visibilidade compartilhada (AD-005)', () => {
  it('o tenant A lê a linha de cache mesmo sem ser dono dela', async () => {
    const row = await runAsTenantWithRole(tenantAId, congAId, (tx) =>
      tx.bibleChapterCache.findUnique({ where: { id: cacheRowId } }),
    );

    expect(row?.book_code).toBe('JHN');
  });

  it('o tenant B, totalmente diferente, lê a MESMA linha de cache — visibilidade total é a decisão da AD-005', async () => {
    const row = await runAsTenantWithRole(tenantBId, congBId, (tx) =>
      tx.bibleChapterCache.findUnique({ where: { id: cacheRowId } }),
    );

    expect(row?.id).toBe(cacheRowId);
    expect(row?.book_code).toBe('JHN');
  });
});
