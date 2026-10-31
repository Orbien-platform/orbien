-- Anonimizar a pessoa apaga o dado de saúde da criança (LGPD Art. 11; kids T12).
-- Os cinco caminhos de anonimização (pedido do titular, exclusão, retenção por
-- inatividade, fim de contrato) só preenchem `persons.anonymized_at`; o gatilho
-- cobre todos de uma vez, inclusive os futuros, sem depender de cada chamador
-- lembrar da tabela. SECURITY DEFINER: o job de retenção e o app_user não
-- podem ser barrados pelo RLS na hora de apagar (a função é de quem aplica a
-- migration, que ignora RLS) — mesmo desenho de audit_insert().
CREATE OR REPLACE FUNCTION kids_child_health_erase_on_anonymize()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM kids_child_health WHERE person_id = NEW.id;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION kids_child_health_erase_on_anonymize() FROM PUBLIC;

DROP TRIGGER IF EXISTS kids_child_health_erase_on_anonymize ON persons;
CREATE TRIGGER kids_child_health_erase_on_anonymize
  AFTER UPDATE OF anonymized_at ON persons
  FOR EACH ROW
  WHEN (NEW.anonymized_at IS NOT NULL AND OLD.anonymized_at IS DISTINCT FROM NEW.anonymized_at)
  EXECUTE FUNCTION kids_child_health_erase_on_anonymize();
