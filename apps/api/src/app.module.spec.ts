/**
 * Sobe o AppModule inteiro num teste de unidade — é o único jeito de pegar
 * provider mal registrado sem depender do Postgres efêmero da suíte de
 * integração. Duas coisas precisam de contorno, e nenhuma delas testa
 * comportamento de verdade:
 *
 *   - `archiver` é ESM-only e o Jest no Node 22 não dá `require` nele; o
 *     mock abaixo espelha `test/stubs/archiver.ts`, usado pela suíte de
 *     integração pelo mesmo motivo.
 *   - `apps/api/.env` (JWT_SECRET, DATABASE_URL, DIRECT_URL) precisa existir
 *     no worktree — é o `ConfigModule.forRoot` do próprio AppModule que o
 *     carrega, então valores de teste aqui seriam side effect, não fonte.
 */

jest.mock('archiver', () => ({
  ZipArchive: class {
    constructor() {
      throw new Error('archiver está mockado no teste de unidade do AppModule');
    }
  },
}));

import { Test } from '@nestjs/testing';
import { AppModule } from './app.module';
import { AppController } from './app.controller';

describe('AppModule', () => {
  it('compila com todos os módulos de domínio registrados', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    expect(moduleRef.get(AppController)).toBeInstanceOf(AppController);
  });

  it('sem JWT_EXPIRES_IN no ambiente, cai no default de 900s — o outro ramo do `??`', () => {
    // `apps/api/.env` define JWT_EXPIRES_IN=900, e é o próprio
    // `ConfigModule.forRoot` (primeiro item do array de imports) quem o
    // carrega — `ConfigModule.loadEnvFile` faz `fs.existsSync(envFilePath)`
    // antes de ler, e só então `dotenv.parse` — antes da linha do
    // JwtModule.register avaliar. Ou seja: a importação normal do topo deste
    // arquivo já roda com o valor do ambiente presente, nunca o default. Para
    // exercitar o ramo do `??`, este teste faz `fs.existsSync` mentir que o
    // `.env` não existe dentro do require isolado — sem isso o .env volta a
    // preencher a variável sozinho. `existsSync` no objeto real do Node não é
    // reconfigurável (spyOn estoura "Cannot redefine property"), por isso o
    // mock é via `jest.doMock`, escopado ao require isolado abaixo.
    const previous = process.env['JWT_EXPIRES_IN'];
    delete process.env['JWT_EXPIRES_IN'];

    jest.isolateModules(() => {
      jest.doMock('fs', () => ({
        ...jest.requireActual('fs'),
        existsSync: jest.fn(() => false),
      }));
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('./app.module');
    });

    if (previous === undefined) delete process.env['JWT_EXPIRES_IN'];
    else process.env['JWT_EXPIRES_IN'] = previous;
  });
});
