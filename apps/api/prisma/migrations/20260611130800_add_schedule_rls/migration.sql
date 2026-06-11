-- =============================================================================
-- ORBIEN — add_schedule_rls
-- Enables tenant isolation on service_schedules, schedule_slots,
-- schedule_assignments. Child tables inherit tenant via parent lookup.
-- =============================================================================

ALTER TABLE service_schedules    ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_schedules    FORCE ROW LEVEL SECURITY;
ALTER TABLE schedule_slots       ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_slots       FORCE ROW LEVEL SECURITY;
ALTER TABLE schedule_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_assignments FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON service_schedules
  AS PERMISSIVE FOR ALL TO app_user
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

CREATE POLICY tenant_isolation ON schedule_slots
  AS PERMISSIVE FOR ALL TO app_user
  USING (
    schedule_id IN (
      SELECT id FROM service_schedules WHERE tenant_id = app_current_tenant()
    )
  )
  WITH CHECK (
    schedule_id IN (
      SELECT id FROM service_schedules WHERE tenant_id = app_current_tenant()
    )
  );

CREATE POLICY tenant_isolation ON schedule_assignments
  AS PERMISSIVE FOR ALL TO app_user
  USING (
    slot_id IN (
      SELECT ss.id FROM schedule_slots ss
      JOIN service_schedules sc ON sc.id = ss.schedule_id
      WHERE sc.tenant_id = app_current_tenant()
    )
  )
  WITH CHECK (
    slot_id IN (
      SELECT ss.id FROM schedule_slots ss
      JOIN service_schedules sc ON sc.id = ss.schedule_id
      WHERE sc.tenant_id = app_current_tenant()
    )
  );
