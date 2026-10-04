import axios from "axios";

/**
 * Cliente HTTP das telas.
 *
 * Não carrega mais `Authorization`: a sessão é cookie `HttpOnly` e o token é
 * anexado no servidor, pelo handler de `/api-proxy`. Como a `baseURL` é
 * relativa, o cookie viaja sozinho — mesma origem.
 *
 * O que sobrou aqui é a renovação, e ela continua no cliente por um motivo: a
 * API revoga a família inteira de refresh tokens ao ver reuso, então duas
 * renovações concorrentes derrubam a sessão. A fila abaixo garante uma por
 * vez **dentro da mesma aba**. O que mudou é que ela não manipula token
 * nenhum — só chama `/api/session/refresh`, que regrava os cookies do lado
 * de lá.
 */
const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
});

let isRefreshing = false;
let failedQueue: Array<{
  resolve: () => void;
  reject: (error: unknown) => void;
}> = [];

function processQueue(error: unknown): void {
  for (const pending of failedQueue) {
    if (error) pending.reject(error);
    else pending.resolve();
  }
  failedQueue = [];
}

/**
 * Nome da trava do Web Locks API, compartilhada entre todas as abas da mesma
 * origem — ao contrário de `isRefreshing`, que é estado de módulo e por isso
 * só serializa dentro de uma aba.
 */
const REFRESH_LOCK_NAME = "orbien-session-refresh";

/**
 * Serializa a chamada de renovação entre abas.
 *
 * `isRefreshing` resolve a corrida *dentro* de uma aba, mas duas abas são
 * dois módulos JS distintos — cada uma com seu próprio `isRefreshing`, que
 * nunca se enxergam. Se as duas leem o cookie de refresh antes de qualquer
 * uma rotacionar e chamam `/api/session/refresh` quase juntas, a API rotaciona
 * na primeira e vê a segunda como reuso — e revoga a família inteira,
 * derrubando as duas abas para o login.
 *
 * `navigator.locks` é por origem, não por aba: a segunda chamada só roda
 * depois que a primeira terminou e os cookies já foram regravados, então ela
 * lê o refresh token **atual** (já rotacionado), não o que ficou stale. Sem
 * suporte à API (ambiente sem `navigator`, ou o Safari antigo que não tem
 * `locks`), cai para a chamada direta — mesmo comportamento de antes desta
 * mudança, com a mesma corrida entre abas que já existia.
 */
async function renovarSessao(): Promise<void> {
  if (typeof navigator !== "undefined" && "locks" in navigator) {
    await navigator.locks.request(REFRESH_LOCK_NAME, () =>
      axios.post("/api/session/refresh")
    );
    return;
  }
  await axios.post("/api/session/refresh");
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config as typeof error.config & { _retry?: boolean };

    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise<void>((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then(() => api(original));
    }

    original._retry = true;
    isRefreshing = true;

    try {
      await renovarSessao();
      processQueue(null);
      return api(original);
    } catch (refreshError) {
      processQueue(refreshError);
      if (typeof window !== "undefined") window.location.href = "/login";
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

/**
 * O servidor negou por papel — e não por qualquer outra coisa.
 *
 * Existe porque as telas engoliam todo erro com `.catch(() => setX([]))`, e um
 * 403 virava lista vazia: quem não tem permissão lia "Nenhuma celebração
 * cadastrada" e concluía que a igreja não tem culto. São coisas diferentes e
 * precisam ser ditas diferente.
 *
 * 401 não entra aqui de propósito: o interceptor acima o trata renovando a
 * sessão, e o que sobra dele já é redirecionamento para `/login`.
 */
export function isForbidden(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 403;
}

export default api;
