// Tipos puros de branding (MOB-03) — espelham
// `ResolvedSettings.branding` de `apps/api/src/settings/settings.service.ts`
// (`GET /settings`), sem importar o service do Nest. Ver design.md, Data
// Models.

export interface Branding {
  app_name: string | null;
  primary_color: string | null;
  logo_url: string | null;
  splash_url: string | null;
}
