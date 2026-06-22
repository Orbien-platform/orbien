-- =============================================================================
-- ORBIEN — add_settings_fields (GAP-07 parte 1)
-- Campos de contato no Tenant e de contato/branding override na Congregation.
-- =============================================================================

-- ── Congregation ──────────────────────────────────────────────────────────────

ALTER TABLE "congregations"
  ADD COLUMN "email"         TEXT,
  ADD COLUMN "phone"         TEXT,
  ADD COLUMN "logo_url"      TEXT,
  ADD COLUMN "primary_color" TEXT,
  ADD COLUMN "app_name"      TEXT;

-- ── Tenant ────────────────────────────────────────────────────────────────────

ALTER TABLE "tenants"
  ADD COLUMN "email" TEXT,
  ADD COLUMN "phone" TEXT;
