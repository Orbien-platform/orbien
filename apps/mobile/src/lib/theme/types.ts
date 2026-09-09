// Tipos puros de branding (MOB-03) — espelham
// `ResolvedSettings.branding` de `apps/api/src/settings/settings.service.ts`
// (`GET /settings`), sem importar o service do Nest. Ver design.md, Data
// Models.

export interface Branding {
  app_name: string | null;
  primary_color: string | null;
  /** Cor de destaque (accent) — o par de `primary_color`, §6 do
   * STYLE-GUIDE.md. Opcional porque um branding em cache gravado antes de a
   * API expor o campo continua válido: sem ele, o accent cai na camada de
   * baixo da cadeia (ver ./brand-theme.ts). */
  accent_color?: string | null;
  logo_url: string | null;
  splash_url: string | null;
}
