/**
 * Fluxo HTTP completo da Bíblia (biblia-nvi-marcacoes-mobile, BIB-01, BIB-02,
 * BIB-04, BIB-06, BIB-08) contra banco de verdade — mesmo padrão de
 * `songs.spec.ts`: supertest + AppModule + PrismaClient admin.
 *
 * `BibleTextProvider` é sobrescrito por um fake determinístico
 * (`overrideProvider`): nenhuma chamada de rede real acontece, e nenhuma
 * `BIBLE_API_KEY` precisa existir para este teste passar (design.md, Risks —
 * "provedor real ainda não está escolhido/contratado nesta sessão").
 *
 * O que o teste prova, na ordem: 1) leitura de capítulo é cache-miss real
 * (a tabela `bible_chapter_cache` está vazia no início) e o fake é chamado
 * exatamente uma vez; 2) a marcação criada a partir desse capítulo aparece
 * no feed da congregação, paginado.
 *
 * Uso: DATABASE_URL=... DIRECT_URL=... npm run test:integration -w orbien-backend
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { BIBLE_TEXT_PROVIDER, BibleTextProvider } from '../../src/bible/bible-text-provider.interface';

const admin = new PrismaClient({
  datasources: { db: { url: process.env['DIRECT_URL']! } },
  log: [],
});

let app: INestApplication;
let token: string;
const ts = Date.now();
let tenantId: string;
let congregationId: string;

const FAKE_VERSES = Array.from({ length: 21 }, (_, i) => ({
  number: i + 1,
  text: `João, versículo ${i + 1} (fake)`,
}));

let getChapterCalls = 0;
const fakeProvider: BibleTextProvider = {
  getChapter: async (bookCode: string, chapter: number) => {
    getChapterCalls += 1;
    void bookCode;
    void chapter;
    return FAKE_VERSES;
  },
};

beforeAll(async () => {
  const tenant = await admin.tenant.create({ data: { slug: `bib-${ts}`, name: 'Bib' } });
  tenantId = tenant.id;
  const cong = await admin.congregation.create({
    data: { tenant_id: tenantId, name: 'Sede' },
  });
  congregationId = cong.id;

  await admin.$executeRaw`INSERT INTO roles (code, name) VALUES ('member','Membro') ON CONFLICT (code) DO NOTHING`;

  const person = await admin.person.create({
    data: { tenant_id: tenantId, congregation_id: congregationId, full_name: 'Membro Bíblia' },
  });
  const acct = await admin.userAccount.create({
    data: {
      tenant_id: tenantId,
      congregation_id: congregationId,
      person_id: person.id,
      email: `membro-${ts}@bib.test`,
      password_hash: 'x',
      is_active: true,
    },
  });
  await admin.roleAssignment.create({
    data: {
      tenant_id: tenantId,
      congregation_id: congregationId,
      user_account_id: acct.id,
      role_code: 'member',
    },
  });

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(BIBLE_TEXT_PROVIDER)
    .useValue(fakeProvider)
    .compile();
  app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.setGlobalPrefix('api');
  await app.init();

  token = app.get(JwtService).sign({
    sub: acct.id,
    email: acct.email,
    tenant_id: tenantId,
    congregation_id: congregationId,
    roles: ['member'],
  });
}, 120_000);

afterAll(async () => {
  await admin.tenant.deleteMany({ where: { id: tenantId } });
  await admin.bibleChapterCache.deleteMany({ where: { version: 'NVI', book_code: 'JHN', chapter: 3 } });
  await admin.$disconnect();
  await app?.close();
}, 60_000);

it('lê o capítulo (cache-miss via fake provider), cria a marcação e vê o item no feed', async () => {
  const cachedBefore = await admin.bibleChapterCache.findUnique({
    where: { version_book_code_chapter: { version: 'NVI', book_code: 'JHN', chapter: 3 } },
  });
  expect(cachedBefore).toBeNull();

  // 1) leitura do capítulo — cache-miss real, fake provider chamado
  const chapterRes = await request(app.getHttpServer())
    .get('/api/bible/books/JHN/chapters/3')
    .set('Authorization', `Bearer ${token}`);

  expect(chapterRes.status).toBe(200);
  expect(chapterRes.body.book_code).toBe('JHN');
  expect(chapterRes.body.chapter).toBe(3);
  expect(chapterRes.body.verses).toEqual(FAKE_VERSES);
  expect(getChapterCalls).toBe(1);

  const cachedAfter = await admin.bibleChapterCache.findUnique({
    where: { version_book_code_chapter: { version: 'NVI', book_code: 'JHN', chapter: 3 } },
  });
  expect(cachedAfter?.verses).toEqual(FAKE_VERSES);

  // 2) criação da marcação a partir desse capítulo já lido
  const createRes = await request(app.getHttpServer())
    .post('/api/bible/marks')
    .set('Authorization', `Bearer ${token}`)
    .send({ book_code: 'JHN', chapter: 3, verse_start: 16, verse_end: 18, comment: 'Deus amou o mundo...' });

  expect(createRes.status).toBe(201);
  expect(createRes.body).toMatchObject({
    book_code: 'JHN',
    chapter: 3,
    verse_start: 16,
    verse_end: 18,
    comment: 'Deus amou o mundo...',
    is_mine: true,
    can_delete: true,
  });
  const markId = createRes.body.id as string;

  // repetir a mesma leitura agora bate no cache — nenhuma chamada nova ao fake
  const secondRead = await request(app.getHttpServer())
    .get('/api/bible/books/JHN/chapters/3')
    .set('Authorization', `Bearer ${token}`);
  expect(secondRead.status).toBe(200);
  expect(getChapterCalls).toBe(1);

  // 3) o feed da congregação mostra o item, paginado
  const feedRes = await request(app.getHttpServer())
    .get('/api/bible/feed')
    .set('Authorization', `Bearer ${token}`);

  expect(feedRes.status).toBe(200);
  expect(feedRes.body.items).toHaveLength(1);
  expect(feedRes.body.items[0]).toMatchObject({ id: markId, comment: 'Deus amou o mundo...' });
  expect(feedRes.body.nextCursor).toBeNull();
});

it('rejeita capítulo além do total do livro com 400, sem chamar o fake provider', async () => {
  const before = getChapterCalls;

  const res = await request(app.getHttpServer())
    .get('/api/bible/books/JHN/chapters/999')
    .set('Authorization', `Bearer ${token}`);

  expect(res.status).toBe(400);
  expect(getChapterCalls).toBe(before);
});
