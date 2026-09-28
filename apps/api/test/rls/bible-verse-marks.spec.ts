/**
 * RLS — marcações de versículo da NVI (biblia-nvi-marcacoes-mobile, BIB-07)
 *
 * `bible_verse_marks` é tabela NOVA, e o que este arquivo mede é que ela
 * nasceu com a policy certa: escopo de CONGREGAÇÃO
 * (`020_rls_bible_verse_marks.sql`, AD-001). Sem o script, a tabela ficaria
 * sem RLS e `app_user` — que tem GRANT em tudo em `public` por ALTER DEFAULT
 * PRIVILEGES — leria as marcações de qualquer outra igreja.
 *
 * Duas congregações do MESMO tenant, de propósito: o caso que só o
 * isolamento por tenant deixaria passar é justamente esse. Uma terceira
 * congregação de outro tenant cobre o eixo de fora.
 *
 * `runAsTenantWithRole` e não `runAsTenant`: a policy é `TO app_user`, e é
 * essa a forma como a produção roda (o `TenantContextInterceptor` faz
 * `SET LOCAL ROLE app_user` antes do `set_config`).
 */

import { prismaAdmin, runAsTenantWithRole } from '../helpers/rls';

const ts = Date.now();

let tenantAId: string;
let congA1Id: string;
let congA2Id: string;
let tenantBId: string;
let congBId: string;

let markA1Id: string;
let markA2Id: string;
let personA1Id: string;

async function createMark(tenantId: string, congregationId: string, personId: string, label: string) {
  const mark = await prismaAdmin.bibleVerseMark.create({
    data: {
      tenant_id: tenantId,
      congregation_id: congregationId,
      person_id: personId,
      book_code: 'JHN',
      chapter: 3,
      verse_start: 16,
      verse_end: 18,
      comment: `Comentário ${label} ${ts}`,
    },
  });
  return mark.id;
}

beforeAll(async () => {
  const tenantA = await prismaAdmin.tenant.create({
    data: { slug: `bib-a-${ts}`, name: 'Tenant A (bíblia)' },
  });
  tenantAId = tenantA.id;
  congA1Id = (
    await prismaAdmin.congregation.create({ data: { tenant_id: tenantAId, name: 'A — Sede' } })
  ).id;
  congA2Id = (
    await prismaAdmin.congregation.create({ data: { tenant_id: tenantAId, name: 'A — Filial' } })
  ).id;

  const tenantB = await prismaAdmin.tenant.create({
    data: { slug: `bib-b-${ts}`, name: 'Tenant B (bíblia)' },
  });
  tenantBId = tenantB.id;
  congBId = (
    await prismaAdmin.congregation.create({ data: { tenant_id: tenantBId, name: 'B — Sede' } })
  ).id;

  const personA1 = await prismaAdmin.person.create({
    data: {
      tenant_id: tenantAId,
      congregation_id: congA1Id,
      full_name: `Membro A-Sede ${ts}`,
      classification: 'member',
      gender: 'male',
    },
  });
  const personA2 = await prismaAdmin.person.create({
    data: {
      tenant_id: tenantAId,
      congregation_id: congA2Id,
      full_name: `Membro A-Filial ${ts}`,
      classification: 'member',
      gender: 'female',
    },
  });
  const personB = await prismaAdmin.person.create({
    data: {
      tenant_id: tenantBId,
      congregation_id: congBId,
      full_name: `Membro B-Sede ${ts}`,
      classification: 'member',
      gender: 'male',
    },
  });

  personA1Id = personA1.id;
  markA1Id = await createMark(tenantAId, congA1Id, personA1.id, 'A-Sede');
  markA2Id = await createMark(tenantAId, congA2Id, personA2.id, 'A-Filial');

  // Curtida e resposta na marcação da Filial, feitas por quem é de lá.
  await prismaAdmin.bibleVerseMarkLike.create({
    data: { tenant_id: tenantAId, congregation_id: congA2Id, mark_id: markA2Id, person_id: personA2.id },
  });
  await prismaAdmin.bibleVerseMarkReply.create({
    data: {
      tenant_id: tenantAId,
      congregation_id: congA2Id,
      mark_id: markA2Id,
      person_id: personA2.id,
      comment: `Resposta A-Filial ${ts}`,
    },
  });
  await createMark(tenantBId, congBId, personB.id, 'B-Sede');
}, 60_000);

afterAll(async () => {
  await prismaAdmin.bibleVerseMarkLike.deleteMany({
    where: { tenant_id: { in: [tenantAId, tenantBId] } },
  });
  await prismaAdmin.bibleVerseMarkReply.deleteMany({
    where: { tenant_id: { in: [tenantAId, tenantBId] } },
  });
  await prismaAdmin.bibleVerseMark.deleteMany({
    where: { tenant_id: { in: [tenantAId, tenantBId] } },
  });
  await prismaAdmin.person.deleteMany({ where: { tenant_id: { in: [tenantAId, tenantBId] } } });
  await prismaAdmin.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
  await prismaAdmin.$disconnect();
}, 30_000);

describe('bible_verse_marks — isolamento (BIB-07)', () => {
  it('a congregação vê a própria marcação (controle positivo)', async () => {
    const row = await runAsTenantWithRole(tenantAId, congA1Id, (tx) =>
      tx.bibleVerseMark.findUnique({ where: { id: markA1Id } }),
    );

    expect(row?.book_code).toBe('JHN');
  });

  it('a congregação IRMÃ, do mesmo tenant, não vê — é o caso que só tenant_id deixaria passar', async () => {
    const row = await runAsTenantWithRole(tenantAId, congA1Id, (tx) =>
      tx.bibleVerseMark.findUnique({ where: { id: markA2Id } }),
    );

    expect(row).toBeNull();
  });

  it('listagem ampla só traz a congregação do contexto', async () => {
    const rows = await runAsTenantWithRole(tenantAId, congA1Id, (tx) =>
      tx.bibleVerseMark.findMany(),
    );

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.congregation_id === congA1Id)).toBe(true);
  });

  it('o outro tenant não vê nada de A', async () => {
    const rows = await runAsTenantWithRole(tenantBId, congBId, (tx) =>
      tx.bibleVerseMark.findMany({ where: { tenant_id: tenantAId } }),
    );

    expect(rows).toHaveLength(0);
  });

  it('escrever marcação na congregação alheia é negado — o WITH CHECK diz o mesmo que o USING', async () => {
    const personA1 = await prismaAdmin.person.findFirstOrThrow({
      where: { tenant_id: tenantAId, congregation_id: congA1Id },
    });

    await expect(
      runAsTenantWithRole(tenantAId, congA1Id, (tx) =>
        tx.bibleVerseMark.create({
          data: {
            tenant_id: tenantAId,
            congregation_id: congA2Id,
            person_id: personA1.id,
            book_code: 'JHN',
            chapter: 3,
            verse_start: 1,
            verse_end: 1,
            comment: `Intruso ${ts}`,
          },
        }),
      ),
    ).rejects.toThrow();
  });
});

/**
 * Curtidas e respostas (`022_rls_bible_verse_mark_interactions.sql`): mesmo
 * escopo de congregação da marcação. O caso que importa é o da congregação
 * irmã — sem a policy, a Sede leria (e gravaria) nas marcações da Filial.
 */
describe('bible_verse_mark_likes / bible_verse_mark_replies — isolamento', () => {
  it('a própria congregação vê curtida e resposta (controle positivo)', async () => {
    const [likes, replies] = await runAsTenantWithRole(tenantAId, congA2Id, async (tx) => [
      await tx.bibleVerseMarkLike.findMany({ where: { mark_id: markA2Id } }),
      await tx.bibleVerseMarkReply.findMany({ where: { mark_id: markA2Id } }),
    ]);

    expect(likes).toHaveLength(1);
    expect(replies).toHaveLength(1);
  });

  it('a congregação IRMÃ não vê curtida nem resposta da outra', async () => {
    const [likes, replies] = await runAsTenantWithRole(tenantAId, congA1Id, async (tx) => [
      await tx.bibleVerseMarkLike.findMany({ where: { mark_id: markA2Id } }),
      await tx.bibleVerseMarkReply.findMany({ where: { mark_id: markA2Id } }),
    ]);

    expect(likes).toHaveLength(0);
    expect(replies).toHaveLength(0);
  });

  it('o outro tenant não vê nada', async () => {
    const [likes, replies] = await runAsTenantWithRole(tenantBId, congBId, async (tx) => [
      await tx.bibleVerseMarkLike.findMany({ where: { tenant_id: tenantAId } }),
      await tx.bibleVerseMarkReply.findMany({ where: { tenant_id: tenantAId } }),
    ]);

    expect(likes).toHaveLength(0);
    expect(replies).toHaveLength(0);
  });

  it('curtir e responder gravando na congregação alheia é negado — WITH CHECK igual ao USING', async () => {
    await expect(
      runAsTenantWithRole(tenantAId, congA1Id, (tx) =>
        tx.bibleVerseMarkLike.create({
          data: { tenant_id: tenantAId, congregation_id: congA2Id, mark_id: markA2Id, person_id: personA1Id },
        }),
      ),
    ).rejects.toThrow();

    await expect(
      runAsTenantWithRole(tenantAId, congA1Id, (tx) =>
        tx.bibleVerseMarkReply.create({
          data: {
            tenant_id: tenantAId,
            congregation_id: congA2Id,
            mark_id: markA2Id,
            person_id: personA1Id,
            comment: `Intruso ${ts}`,
          },
        }),
      ),
    ).rejects.toThrow();
  });

  it('a própria congregação curte e responde normalmente', async () => {
    const like = await runAsTenantWithRole(tenantAId, congA1Id, (tx) =>
      tx.bibleVerseMarkLike.create({
        data: { tenant_id: tenantAId, congregation_id: congA1Id, mark_id: markA1Id, person_id: personA1Id },
      }),
    );
    expect(like.mark_id).toBe(markA1Id);
  });
});
