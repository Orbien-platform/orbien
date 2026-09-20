/**
 * `node-ofx-parser` não publica tipos (nem `@types/node-ofx-parser` existe).
 * Só o parse é usado — `parse()` devolve o SGML do OFX 1.x convertido em
 * objeto, com a mesma estrutura de tags do arquivo (`OFX.BANKMSGSRSV1...`),
 * então o formato exato varia por banco. `OfxImportService` não modela essa
 * árvore inteira: percorre o objeto procurando qualquer nó `STMTTRN`.
 */
declare module 'node-ofx-parser' {
  export function parse(data: string): Record<string, unknown>;
  export function serialize(
    header: Record<string, string>,
    body: Record<string, unknown>,
  ): string;
}
