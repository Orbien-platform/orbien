import { Logger } from '@nestjs/common';

/**
 * Domínio público do web em produção. Todo link que a API manda para fora
 * (redefinição de senha, convite) aponta para cá.
 */
export const PRODUCTION_WEB_URL = 'https://web.useorbien.com';

const PRODUCTION_DOMAIN = 'useorbien.com';
const DEV_DEFAULT = 'http://localhost:3001';

const logger = new Logger('FrontendUrl');

function isUseOrbienHost(hostname: string): boolean {
  return hostname === PRODUCTION_DOMAIN || hostname.endsWith(`.${PRODUCTION_DOMAIN}`);
}

/**
 * Base dos links do web, sem barra no fim.
 *
 * Em produção, só vale host em `useorbien.com`: um `FRONTEND_URL` apontando
 * para `*.vercel.app` (ou vazio, ou inválido) mandou e-mail de redefinição de
 * senha com o domínio da Vercel. Em vez de confiar na digitação do painel do
 * Render, cai para `PRODUCTION_WEB_URL` e registra o aviso. Fora de produção,
 * o valor é usado como veio — e o default é o web local.
 */
export function frontendUrl(): string {
  const raw = (process.env['FRONTEND_URL'] ?? '').trim().replace(/\/+$/, '');
  const isProduction = process.env['NODE_ENV'] === 'production';

  if (!isProduction) return raw || DEV_DEFAULT;

  let hostname: string | null = null;
  try {
    hostname = raw ? new URL(raw).hostname : null;
  } catch {
    hostname = null;
  }

  if (hostname && isUseOrbienHost(hostname)) return raw;

  logger.warn(
    `FRONTEND_URL="${raw}" não está em ${PRODUCTION_DOMAIN} — usando ${PRODUCTION_WEB_URL}.`,
  );
  return PRODUCTION_WEB_URL;
}
