import { MailBrand, readableTextOn } from './mail-brand';

/**
 * Layout único dos e-mails transacionais. Tabela e estilo inline de propósito:
 * é o que Gmail, Outlook e o app de e-mail do celular renderizam igual — CSS
 * em `<style>`, flex e variável CSS não chegam lá.
 *
 * A identidade vem toda da `MailBrand`: a faixa de cima é o accent, o botão é
 * a primária, o cabeçalho é o logo (ou o nome, sem logo), o rodapé assina com
 * o nome. Na plataforma, o cabeçalho é a marca escrita da Orbien, a mesma do
 * login do console.
 */
export interface MailContent {
  /** Texto de pré-visualização mostrado pela caixa de entrada ao lado do assunto. */
  preheader: string;
  heading: string;
  /** Parágrafos em texto puro — cada um é escapado. */
  paragraphs: string[];
  action: { label: string; url: string };
  /** Nota abaixo do botão (validade do link, "se não foi você..."). */
  note?: string;
}

// Neutros do design system: ink, stone, borda e o fundo parchment.
const INK = '#1A1A1A';
const STONE = '#5C5A56';
const MUTED = '#9B9893';
const BORDER = '#E0DDD9';
const CANVAS = '#F4F4F2';
const FONT = "'DM Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Primária como cor de texto sobre o branco — só se ela for escura o bastante
 * para isso. Primária clara (amarelo, verde-limão) funciona no botão, com texto
 * escuro por cima, mas some como título; aí o texto fica em ink.
 */
function textColor(brand: MailBrand): string {
  return readableTextOn(brand.primaryColor) === '#FFFFFF' ? brand.primaryColor : INK;
}

function header(brand: MailBrand): string {
  if (brand.kind === 'platform') {
    return `<span style="font-family: ${FONT}; font-size: 26px; font-weight: 500; letter-spacing: -0.5px; color: ${brand.primaryColor};">orbien</span><span style="font-family: ${FONT}; font-size: 26px; font-weight: 500; color: ${brand.accentColor};">.</span>`;
  }
  if (brand.logoUrl) {
    return `<img src="${escapeHtml(brand.logoUrl)}" alt="${escapeHtml(brand.name)}" height="48" style="display: block; height: 48px; width: auto; max-width: 220px; border: 0;" />`;
  }
  return `<span style="font-family: ${FONT}; font-size: 22px; font-weight: 600; color: ${textColor(brand)};">${escapeHtml(brand.name)}</span>`;
}

function footer(brand: MailBrand): string {
  if (brand.kind === 'platform') {
    return 'Orbien — Gestão inteligente para igrejas';
  }
  return `Você recebeu este e-mail porque tem cadastro em ${escapeHtml(brand.name)}.`;
}

export function renderMail(brand: MailBrand, content: MailContent): string {
  const buttonText = readableTextOn(brand.primaryColor);
  const url = escapeHtml(content.action.url);
  const paragraphs = content.paragraphs
    .map(
      (p) =>
        `<p style="margin: 0 0 16px; font-family: ${FONT}; font-size: 16px; line-height: 1.6; color: ${INK};">${escapeHtml(p)}</p>`,
    )
    .join('');
  const note = content.note
    ? `<p style="margin: 24px 0 0; font-family: ${FONT}; font-size: 14px; line-height: 1.5; color: ${STONE};">${escapeHtml(content.note)}</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light" />
<title>${escapeHtml(content.heading)}</title>
</head>
<body style="margin: 0; padding: 0; background: ${CANVAS};">
<div style="display: none; max-height: 0; overflow: hidden; opacity: 0;">${escapeHtml(content.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background: ${CANVAS};">
<tr><td align="center" style="padding: 32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 520px; background: #FFFFFF; border: 1px solid ${BORDER}; border-radius: 12px; overflow: hidden;">
<tr><td style="height: 4px; line-height: 4px; font-size: 0; background: ${brand.accentColor};">&nbsp;</td></tr>
<tr><td style="padding: 32px 32px 8px;">${header(brand)}</td></tr>
<tr><td style="padding: 16px 32px 32px;">
<h1 style="margin: 0 0 16px; font-family: ${FONT}; font-size: 22px; font-weight: 600; line-height: 1.3; color: ${textColor(brand)};">${escapeHtml(content.heading)}</h1>
${paragraphs}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 8px 0 0;">
<tr><td style="border-radius: 8px; background: ${brand.primaryColor};">
<a href="${url}" style="display: inline-block; padding: 14px 28px; font-family: ${FONT}; font-size: 16px; font-weight: 600; color: ${buttonText}; text-decoration: none; border-radius: 8px;">${escapeHtml(content.action.label)}</a>
</td></tr>
</table>
<p style="margin: 16px 0 0; font-family: ${FONT}; font-size: 13px; line-height: 1.5; color: ${MUTED}; word-break: break-all;">Se o botão não abrir, copie este endereço no navegador: <a href="${url}" style="color: ${textColor(brand)};">${url}</a></p>
${note}
</td></tr>
<tr><td style="padding: 20px 32px; border-top: 1px solid ${BORDER}; font-family: ${FONT}; font-size: 12px; line-height: 1.5; color: ${MUTED};">${footer(brand)}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
