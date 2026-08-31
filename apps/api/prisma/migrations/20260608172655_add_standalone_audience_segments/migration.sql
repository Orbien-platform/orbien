-- =============================================================================
-- ORBIEN — add_standalone_audience_segments
-- Transforma audience_segments de join-table (ligada a content_post_id)
-- para entidade standalone reutilizável (name + criteria JSON).
-- Posts referenciam segmentos via post_segments (many-to-many).
-- =============================================================================

-- Torna content_post_id, segment_type e segment_value opcionais
ALTER TABLE audience_segments ALTER COLUMN content_post_id DROP NOT NULL;
ALTER TABLE audience_segments ALTER COLUMN segment_type    DROP NOT NULL;
ALTER TABLE audience_segments ALTER COLUMN segment_value   DROP NOT NULL;

-- Adiciona campos de entidade standalone
ALTER TABLE audience_segments ADD COLUMN IF NOT EXISTS name     TEXT;
ALTER TABLE audience_segments ADD COLUMN IF NOT EXISTS criteria JSONB;

-- Tabela de join entre posts e segmentos (many-to-many)
CREATE TABLE IF NOT EXISTS post_segments (
  post_id    TEXT NOT NULL REFERENCES content_posts(id) ON DELETE CASCADE,
  segment_id TEXT NOT NULL REFERENCES audience_segments(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, segment_id)
);

-- RLS para a nova join table (policies existentes em audience_segments já cobertas)
ALTER TABLE post_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_segments FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user NOLOGIN NOBYPASSRLS;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION app_current_tenant()
RETURNS TEXT LANGUAGE SQL STABLE AS $$
  SELECT NULLIF(current_setting('app.tenant_id', TRUE), '')::TEXT;
$$;

CREATE OR REPLACE FUNCTION app_current_congregation()
RETURNS TEXT LANGUAGE SQL STABLE AS $$
  SELECT NULLIF(current_setting('app.congregation_id', TRUE), '')::TEXT;
$$;

-- post_segments: isolamento via content_post pai
DROP POLICY IF EXISTS tenant_isolation ON post_segments;
CREATE POLICY tenant_isolation ON post_segments
  AS PERMISSIVE FOR ALL TO app_user
  USING (
    post_id IN (
      SELECT id FROM content_posts WHERE tenant_id = app_current_tenant()
    )
  )
  WITH CHECK (
    post_id IN (
      SELECT id FROM content_posts WHERE tenant_id = app_current_tenant()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON post_segments TO app_user;
