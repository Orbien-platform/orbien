import type { NextConfig } from "next";

/**
 * O `rewrite` de `/api-proxy` saiu daqui: virou Route Handler em
 * `src/app/api-proxy/[...path]/route.ts`. Rewrite encaminha a requisição como
 * ela chegou, e desde que a sessão passou a ser cookie `HttpOnly` a
 * requisição chega sem `Authorization` — o token precisa ser lido do cookie e
 * anexado no servidor, o que só um handler faz.
 */
const nextConfig: NextConfig = {};

export default nextConfig;
