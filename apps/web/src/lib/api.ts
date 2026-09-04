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
 * vez. O que mudou é que ela não manipula token nenhum — só chama
 * `/api/session/refresh`, que regrava os cookies do lado de lá.
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
      await axios.post("/api/session/refresh");
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

export default api;
