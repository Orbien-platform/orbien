-- =============================================================================
-- ORBIEN — add_volunteer_ministries_rls
-- Enables RLS isolation on the new volunteer_ministries join table.
-- Pattern: same as post_segments — inherit tenant via parent row lookup.
-- =============================================================================

ALTER TABLE volunteer_ministries ENABLE ROW LEVEL SECURITY;
ALTER TABLE volunteer_ministries FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON volunteer_ministries
  AS PERMISSIVE FOR ALL TO app_user
  USING (
    volunteer_profile_id IN (
      SELECT id FROM volunteer_profiles WHERE tenant_id = app_current_tenant()
    )
  )
  WITH CHECK (
    volunteer_profile_id IN (
      SELECT id FROM volunteer_profiles WHERE tenant_id = app_current_tenant()
    )
  );
