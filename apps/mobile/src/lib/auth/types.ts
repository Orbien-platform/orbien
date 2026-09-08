// Tipos puros de sessão (MOB-01) — espelham o contrato de
// `POST /auth/login` da API (`apps/api/src/auth/`), sem importar o DTO do
// Nest (deploys independentes, regra do monorepo). Ver design.md, Data
// Models.

/** Resposta crua de `POST /auth/login` e `POST /auth/refresh`. */
export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number; // segundos; hoje 900 no backend
}

/** Sessão guardada no `expo-secure-store`. */
export interface Session {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: number; // epoch ms, calculado no cliente a partir de expires_in
}
