"use client"; // Error boundaries must be Client Components

/**
 * Sem este arquivo, o Next usa o `/_global-error` default embutido — e essa
 * página pré-renderizada quebra no build com `TypeError: Cannot read
 * properties of null (reading 'useContext')` (mesmo bug pré-existente do
 * Next 16.2.x isolado em `apps/web`, ver docs/TESTES.md Fase 10: reproduz num
 * app novo em folha fora deste repo, então não é algo que código nosso
 * resolve). `global-error.js` **substitui** o root layout quando ativo — não
 * pode depender de `ThemeProvider`/`AuthProvider` deste app, e precisa
 * definir `<html>`/`<body>` próprios.
 */
export default function GlobalError(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- assinatura exigida pelo Next para global-error.js
  props: { error: Error & { digest?: string } }
) {
  return (
    <html lang="pt-BR">
      <body>
        <h2>Algo deu errado.</h2>
        <p>Tente novamente em instantes.</p>
      </body>
    </html>
  );
}
