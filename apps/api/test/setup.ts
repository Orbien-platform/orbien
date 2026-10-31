import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env from project root before any test runs
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

// 90s para as suítes com banco (integration e rls, os dois projetos que carregam
// este arquivo). Sob carga, adquirir conexão ou subir o AppModule passa de 5s.
// Precisa ser aqui e não em `testTimeout` do jest.config.js: o Jest 30 ignora
// `testTimeout` dentro de um item de `projects` (só lê o da raiz, a CLI ou
// `jest.setTimeout`), então o 5000 padrão valia — e estourava sob CPU de CI.
// Se um teste ainda falhar em 90s é gap real — investigue, não aumente.
jest.setTimeout(90_000);
