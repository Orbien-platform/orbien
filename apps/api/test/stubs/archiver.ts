/**
 * Stub de `archiver` para as suítes de integração.
 *
 * Motivo: a suíte de integração sobe o `AppModule` inteiro, e o grafo de
 * módulos alcança `financial/export/zip-export.service.ts`, que importa
 * `archiver`. O pacote é ESM-only; o Jest no Node 22 não consegue `require` de
 * ESM e a suíte nem chega a rodar.
 *
 * O stub existe para o import resolver no boot, não para exercitar exportação
 * de ZIP. Nenhum teste de integração toca essa rota; se um dia tocar, este
 * arquivo é o lugar errado para consertar — aí vale o `archiver` de verdade,
 * com Node 24+ ou `transformIgnorePatterns`.
 *
 * Qualquer uso em runtime estoura de propósito, em vez de fingir que
 * arquivou algo.
 */

export class ZipArchive {
  constructor(_opts?: unknown) {
    throw new Error(
      'archiver está stubado na suíte de integração (test/stubs/archiver.ts) — ' +
        'nenhum teste de integração deveria gerar ZIP.',
    );
  }
}

export default ZipArchive;
