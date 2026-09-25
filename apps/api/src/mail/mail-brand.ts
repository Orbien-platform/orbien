/**
 * Marca aplicada ao e-mail. Duas origens, e só duas:
 *
 * - **plataforma** — o que sai do console (`apps/admin`): nome, cores e
 *   assinatura da Orbien;
 * - **tenant** — o que sai do web e do app: nome da igreja, `primary_color`,
 *   `secondary_color` (o accent) e `logo_url` do `branding_configs`.
 *
 * Tudo que vem do tenant é dado de fora do código e vai parar dentro de HTML:
 * cor só passa se for hex, logo só se for URL http(s). O resto cai no padrão
 * da Orbien, em vez de quebrar o layout — ou abrir espaço para injetar
 * atributo no e-mail.
 */
export interface MailBrand {
  kind: 'platform' | 'tenant';
  /** Nome exibido no cabeçalho, no remetente, no assunto e no rodapé. */
  name: string;
  primaryColor: string;
  accentColor: string;
  logoUrl: string | null;
}

// Mesmos valores de `--navy` e `--teal` do design system dos fronts.
const ORBIEN_NAVY = '#1E3A7B';
const ORBIEN_TEAL = '#00B8A2';

export const PLATFORM_MAIL_BRAND: MailBrand = {
  kind: 'platform',
  name: 'Orbien',
  primaryColor: ORBIEN_NAVY,
  accentColor: ORBIEN_TEAL,
  logoUrl: null,
};

/** `select` do Prisma para carregar, a partir de `tenant`, o que `tenantMailBrand` usa. */
export const TENANT_MAIL_BRAND_SELECT = {
  name: true,
  brandingConfig: {
    select: { primary_color: true, secondary_color: true, logo_url: true },
  },
} as const;

export interface TenantBrandSource {
  name: string;
  brandingConfig?: {
    primary_color: string | null;
    secondary_color: string | null;
    logo_url: string | null;
  } | null;
}

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

function safeColor(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed && HEX_COLOR.test(trimmed) ? trimmed : fallback;
}

function safeUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Marca do tenant. Sem tenant (não deveria acontecer: toda conta tem um), cai
 * na da plataforma — e-mail com a marca da Orbien é melhor que e-mail sem
 * nome nenhum.
 */
export function tenantMailBrand(tenant: TenantBrandSource | null | undefined): MailBrand {
  // Vai também para assunto e remetente — nada de quebra de linha ali.
  const name = tenant?.name?.replace(/\s+/g, ' ').trim();
  if (!name) return PLATFORM_MAIL_BRAND;

  const branding = tenant?.brandingConfig;
  return {
    kind: 'tenant',
    name,
    primaryColor: safeColor(branding?.primary_color, ORBIEN_NAVY),
    accentColor: safeColor(branding?.secondary_color, ORBIEN_TEAL),
    logoUrl: safeUrl(branding?.logo_url),
  };
}

/**
 * Cor do texto sobre `hex`: branco ou quase-preto, a que tiver mais contraste
 * (luminância relativa do WCAG). O tenant escolhe a cor primária livremente, e
 * um botão amarelo-claro com texto branco não se lê.
 */
export function readableTextOn(hex: string): string {
  const full =
    hex.length === 4
      ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
      : hex;
  const channel = (i: number) => {
    const c = parseInt(full.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  // Contraste com branco = 1.05 / (L + 0.05); com #1A1A1A (L≈0.0103) = (L + 0.05) / 0.0603.
  return 1.05 / (luminance + 0.05) >= (luminance + 0.05) / 0.0603 ? '#FFFFFF' : '#1A1A1A';
}

/**
 * Remetente com o nome da marca e o endereço de `MAIL_FROM`. O endereço é o
 * mesmo para todo tenant (é o domínio verificado no Resend); só o nome muda.
 * Aspas, `<`, `>` e quebras de linha saem do nome — é cabeçalho de e-mail.
 */
export function mailFrom(brand: MailBrand): string {
  const configured = process.env['MAIL_FROM'] ?? 'Orbien <naoresponda@useorbien.com>';
  const address = configured.match(/<([^>]+)>/)?.[1] ?? configured.trim();
  const name = brand.name.replace(/["<>\r\n\\]/g, '').trim() || 'Orbien';
  return `"${name}" <${address}>`;
}
