"use client"; // Error boundaries must be Client Components

/**
 * Sem este arquivo, o Next usa o `/_global-error` default embutido — e essa
 * página pré-renderizada quebra no build com `TypeError: Cannot read
 * properties of null (reading 'useContext')` (achado e confirmado
 * pré-existente na Fase 7/10 de docs/TESTES.md, com `git stash` provando que
 * já falhava no `main`). `global-error.js` **substitui** o root layout
 * quando ativo — não pode depender de `ThemeProvider`/`AuthProvider`/
 * `TooltipProvider`, e precisa definir `<html>`/`<body>` próprios.
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
