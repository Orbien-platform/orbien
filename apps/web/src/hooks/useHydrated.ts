"use client";

import { useSyncExternalStore } from "react";

/**
 * `false` na renderização do servidor e na primeira do cliente; `true` depois
 * da hidratação.
 *
 * Serve para ler `localStorage` e `location.hash` — que não existem no
 * servidor — sem copiá-los para `useState` dentro de um `useEffect`. Esse
 * caminho é o óbvio e é o errado: ou dá divergência de hidratação, ou vira o
 * `react-hooks/set-state-in-effect` que o lint recusa. Aqui as duas primeiras
 * renderizações são iguais nos dois lados, e a terceira já vê o browser.
 */

const noop = () => () => undefined;
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function useHydrated(): boolean {
  return useSyncExternalStore(noop, clientSnapshot, serverSnapshot);
}
