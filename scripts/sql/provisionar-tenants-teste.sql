-- =============================================================================
-- provisionar-tenants-teste.sql — cria `teste1-church` e `teste2-church`.
--
-- Para rodar no SQL Editor do Supabase (ou em qualquer psql com DIRECT_URL,
-- como `postgres`). Roda como superusuário, então passa por cima do RLS — é o
-- mesmo caminho do seed (`apps/api/prisma/seed.ts`), e o motivo de existir:
-- `scripts/provisionar-tenants-teste.sh` faz o mesmo pela rota de plataforma,
-- mas exige um token de `platform_support` que nem sempre se tem à mão.
--
-- **Idempotente.** Cada bloco só insere o que ainda não existe, comparando
-- por slug, e-mail ou nome. Rodar duas vezes não duplica nada.
--
-- É uma transação só: se qualquer passo falhar, nada fica pela metade.
--
-- ── A senha ─────────────────────────────────────────────────────────────────
--
-- `password_hash` é **argon2id**, e o Postgres não sabe gerar argon2 — o
-- `pgcrypto` só tem bcrypt/MD5. Por isso o hash abaixo vem pronto, calculado
-- fora com a mesma biblioteca que a API usa para conferir (`argon2.verify`
-- lê os parâmetros de dentro da própria string, então não há acoplamento a
-- configuração nenhuma).
--
-- Ele corresponde a `orbien-e2e-publica-2026`, a senha pública das contas de
-- teste — a mesma que `.github/workflows/ci.yml` manda no login do
-- `e2e-prod`. Trocar a senha aqui exige recalcular o hash; não dá para
-- editar a string à mão.
--
-- Para gerar outro, a partir da raiz do repositório — o comando já imprime a
-- expressão pronta, com os campos separados em chr(36) pelo motivo explicado
-- junto de `v_hash`:
--
--   node -e "require('argon2').hash('SUA-SENHA').then(h=>console.log(
--     h.split(String.fromCharCode(36)).slice(1)
--      .map(p=>\"chr(36) || '\"+p+\"'\").join(' ||\n    ')))"
--
-- Ver `docs/AMBIENTES.md` §5 para por que essa senha é pública de propósito.
-- =============================================================================

BEGIN;

DO $prov$
DECLARE
  -- argon2id de 'orbien-e2e-publica-2026', montado com chr(36) — o cifrão.
  --
  -- Escrito assim de propósito, e não como literal inteiro: um hash argon2
  -- separa seus campos por cifrão, e o SQL Editor do Supabase lê o primeiro
  -- par como abertura de uma tag de dollar-quote. Ele procura um fechamento
  -- que não existe, se perde no resto do arquivo e manda um pedaço solto ao
  -- servidor — o que aparece como erro de sintaxe numa LINE 1 inexistente.
  -- Sem nenhum cifrão literal no arquivo, não há tag para confundir ninguém:
  -- é também por isso que os comentários acima não escrevem o símbolo.
  --
  -- Confirmado: a concatenação reproduz o hash original byte a byte, e
  -- `argon2.verify` aceita a senha com ela.
  v_hash CONSTANT text :=
    chr(36) || 'argon2id' ||
    chr(36) || 'v=19' ||
    chr(36) || 'm=65536,t=3,p=4' ||
    chr(36) || 'AKqYT+itrWfCmMurobIixg' ||
    chr(36) || 'NgHhCx5qciY8Uk4ywEWytopWcpxKg21RfCMjLPG5lSQ';

  spec        record;
  cat         record;
  gt          record;
  vol         record;

  v_tenant    text;
  v_cong      text;
  v_user      text;
  v_person    text;
  v_ministry  text;
  v_profile   text;
  v_vperson   text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM roles WHERE code = 'tenant_admin') THEN
    RAISE EXCEPTION 'A tabela roles não tem tenant_admin — banco não semeado.';
  END IF;

  FOR spec IN
    SELECT * FROM (VALUES
      ('teste1-church', 'Teste 1 Church', 'Teste 1 - Sede',
       'fvargaspf+teste1@gmail.com', 'Conta de Teste 1'),
      ('teste2-church', 'Teste 2 Church', 'Teste 2 - Sede',
       'fvargaspf+teste2@gmail.com', 'Conta de Teste 2')
    ) AS t(slug, tname, cong_name, admin_email, admin_name)
  LOOP
    RAISE NOTICE '── %', spec.slug;

    -- ── tenant ──────────────────────────────────────────────────────────────
    SELECT id INTO v_tenant FROM tenants WHERE slug = spec.slug;
    IF v_tenant IS NULL THEN
      v_tenant := gen_random_uuid()::text;
      INSERT INTO tenants (id, slug, name, updated_at)
      VALUES (v_tenant, spec.slug, spec.tname, now());
      RAISE NOTICE '  tenant criado: %', v_tenant;
    ELSE
      RAISE NOTICE '  tenant já existia: %', v_tenant;
    END IF;

    -- ── plano ───────────────────────────────────────────────────────────────
    -- Premium em trial, como o seed: os tenants de teste precisam alcançar o
    -- que o PlanGuard gateia, senão metade da suíte não teria o que exercitar.
    IF NOT EXISTS (SELECT 1 FROM tenant_plans WHERE tenant_id = v_tenant) THEN
      INSERT INTO tenant_plans (id, tenant_id, plan, status, trial_ends_at, updated_at)
      VALUES (gen_random_uuid()::text, v_tenant, 'premium', 'trial',
              now() + interval '30 days', now());
    END IF;

    -- ── branding ────────────────────────────────────────────────────────────
    IF NOT EXISTS (SELECT 1 FROM branding_configs WHERE tenant_id = v_tenant) THEN
      INSERT INTO branding_configs
        (id, tenant_id, primary_color, secondary_color, app_name, pix_key, updated_at)
      VALUES (gen_random_uuid()::text, v_tenant, '#1E3A7B', '#00B8A2',
              spec.tname, '12345678900', now());
    END IF;

    -- ── congregação ─────────────────────────────────────────────────────────
    SELECT id INTO v_cong
      FROM congregations WHERE tenant_id = v_tenant AND name = spec.cong_name;
    IF v_cong IS NULL THEN
      v_cong := gen_random_uuid()::text;
      INSERT INTO congregations (id, tenant_id, name, timezone, updated_at)
      VALUES (v_cong, v_tenant, spec.cong_name, 'America/Sao_Paulo', now());
    END IF;
    RAISE NOTICE '  congregação: %', v_cong;

    -- ── tipos de grupo ──────────────────────────────────────────────────────
    FOR gt IN
      SELECT * FROM (VALUES
        ('Célula', '#1E3A7B'), ('Grupo de Casa', '#0D9488'), ('EBD', '#7C3AED'),
        ('Discipulado', '#B91C1C'), ('Jovens', '#D97706')
      ) AS g(name, color)
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM group_types
         WHERE tenant_id = v_tenant AND congregation_id = v_cong AND name = gt.name
      ) THEN
        INSERT INTO group_types (id, tenant_id, congregation_id, name, color, updated_at)
        VALUES (gen_random_uuid()::text, v_tenant, v_cong, gt.name, gt.color, now());
      END IF;
    END LOOP;

    -- ── conta admin ─────────────────────────────────────────────────────────
    -- `email` é único em todo o banco: o login resolve a conta por ele, sem
    -- tenant. Por isso a checagem não filtra por tenant.
    SELECT id, person_id INTO v_user, v_person
      FROM user_accounts WHERE email = spec.admin_email;

    IF v_user IS NULL THEN
      v_person := gen_random_uuid()::text;
      INSERT INTO persons
        (id, tenant_id, congregation_id, full_name, email, classification, updated_at)
      VALUES (v_person, v_tenant, v_cong, spec.admin_name, spec.admin_email,
              'member', now());

      v_user := gen_random_uuid()::text;
      INSERT INTO user_accounts
        (id, tenant_id, congregation_id, person_id, email, password_hash, updated_at)
      VALUES (v_user, v_tenant, v_cong, v_person, spec.admin_email, v_hash, now());
      RAISE NOTICE '  conta criada: % (%)', spec.admin_email, v_user;
    ELSE
      -- Conta preexistente: a senha NÃO é tocada. Se ela já existe com outra
      -- senha, quem decide trocá-la é você, não este script.
      RAISE NOTICE '  conta já existia: % — senha intacta', spec.admin_email;

      IF v_person IS NULL THEN
        v_person := gen_random_uuid()::text;
        INSERT INTO persons
          (id, tenant_id, congregation_id, full_name, email, classification, updated_at)
        VALUES (v_person, v_tenant, v_cong, spec.admin_name, spec.admin_email,
                'member', now());
        UPDATE user_accounts SET person_id = v_person, updated_at = now()
         WHERE id = v_user;
      END IF;
    END IF;

    -- ── papel ───────────────────────────────────────────────────────────────
    -- Sem unique na tabela: o NOT EXISTS é o que torna repetível.
    IF NOT EXISTS (
      SELECT 1 FROM role_assignments
       WHERE user_account_id = v_user AND role_code = 'tenant_admin'
    ) THEN
      INSERT INTO role_assignments
        (id, tenant_id, congregation_id, user_account_id, role_code, updated_at)
      VALUES (gen_random_uuid()::text, v_tenant, v_cong, v_user, 'tenant_admin', now());
    END IF;

    -- ── plano de contas ─────────────────────────────────────────────────────
    FOR cat IN
      SELECT * FROM (VALUES
        ('Dízimo','income'), ('Oferta','income'), ('Oferta Missionária','income'),
        ('Oferta de Construção','income'), ('Doação Especial','income'),
        ('Outros (Receita)','income'), ('Aluguel','expense'),
        ('Água / Luz / Internet','expense'), ('Material de Limpeza','expense'),
        ('Eventos','expense'), ('Missões','expense'), ('Outros (Despesa)','expense')
      ) AS c(name, ctype)
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM financial_categories
         WHERE tenant_id = v_tenant AND congregation_id = v_cong
           AND name = cat.name AND type = cat.ctype::"FinancialCategoryType"
      ) THEN
        INSERT INTO financial_categories
          (id, tenant_id, congregation_id, name, type, is_system, updated_at)
        VALUES (gen_random_uuid()::text, v_tenant, v_cong, cat.name,
                cat.ctype::"FinancialCategoryType", true, now());
      END IF;
    END LOOP;

    -- ── mínimo que a suíte de e2e precisa ───────────────────────────────────
    -- Celebração (de onde a fixture cria a instância), ministério (seletor de
    -- template) e voluntários (seletor de disponibilidade). Sem isso os specs
    -- falham por falta de dado, antes de tocar a tela.
    IF NOT EXISTS (
      SELECT 1 FROM celebrations
       WHERE tenant_id = v_tenant AND congregation_id = v_cong AND name = 'Culto de Domingo'
    ) THEN
      INSERT INTO celebrations
        (id, tenant_id, congregation_id, name, type, day_of_week, start_time,
         recurrence, updated_at)
      VALUES (gen_random_uuid()::text, v_tenant, v_cong, 'Culto de Domingo',
              'sunday_service', 0, '10:00', 'weekly', now());
    END IF;

    SELECT id INTO v_ministry
      FROM ministries WHERE tenant_id = v_tenant AND congregation_id = v_cong AND name = 'Louvor';
    IF v_ministry IS NULL THEN
      v_ministry := gen_random_uuid()::text;
      INSERT INTO ministries (id, tenant_id, congregation_id, name, description, updated_at)
      VALUES (v_ministry, v_tenant, v_cong, 'Louvor', 'Equipe de música e adoração', now());
    END IF;

    -- Um líder e um voluntário comum: o seletor de disponibilidade distingue
    -- os dois, então ter os dois papéis cobre o caso real.
    FOR vol IN
      SELECT * FROM (VALUES
        ('Carlos Pereira', 'leader', true),
        ('Maria Rodrigues', 'volunteer', false)
      ) AS v(full_name, vrole, is_leader)
    LOOP
      SELECT id INTO v_vperson
        FROM persons
       WHERE tenant_id = v_tenant AND congregation_id = v_cong AND full_name = vol.full_name;
      IF v_vperson IS NULL THEN
        v_vperson := gen_random_uuid()::text;
        INSERT INTO persons
          (id, tenant_id, congregation_id, full_name, classification, updated_at)
        VALUES (v_vperson, v_tenant, v_cong, vol.full_name, 'member', now());
      END IF;

      SELECT id INTO v_profile FROM volunteer_profiles WHERE person_id = v_vperson;
      IF v_profile IS NULL THEN
        v_profile := gen_random_uuid()::text;
        INSERT INTO volunteer_profiles
          (id, tenant_id, congregation_id, person_id, skills, availability, updated_at)
        VALUES (v_profile, v_tenant, v_cong, v_vperson, '{}'::jsonb, '{}'::jsonb, now());
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM volunteer_ministries
         WHERE volunteer_profile_id = v_profile AND ministry_id = v_ministry
      ) THEN
        INSERT INTO volunteer_ministries
          (id, tenant_id, congregation_id, volunteer_profile_id, ministry_id,
           role, is_primary_leader)
        VALUES (gen_random_uuid()::text, v_tenant, v_cong, v_profile, v_ministry,
                vol.vrole::"VolunteerMinistryRole", vol.is_leader);
      END IF;
    END LOOP;

    -- A conta admin também precisa de perfil de voluntário: a aba
    -- "Indisponibilidade" é visível para qualquer usuário logado, e
    -- UnavailabilityService.resolveProfile lança 404 para quem não tem perfil.
    SELECT id INTO v_profile FROM volunteer_profiles WHERE person_id = v_person;
    IF v_profile IS NULL THEN
      v_profile := gen_random_uuid()::text;
      INSERT INTO volunteer_profiles
        (id, tenant_id, congregation_id, person_id, skills, availability, updated_at)
      VALUES (v_profile, v_tenant, v_cong, v_person, '{}'::jsonb, '{}'::jsonb, now());
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM volunteer_ministries
       WHERE volunteer_profile_id = v_profile AND ministry_id = v_ministry
    ) THEN
      INSERT INTO volunteer_ministries
        (id, tenant_id, congregation_id, volunteer_profile_id, ministry_id, role)
      VALUES (gen_random_uuid()::text, v_tenant, v_cong, v_profile, v_ministry, 'volunteer');
    END IF;
  END LOOP;

  -- ── platform_support para a conta principal ───────────────────────────────
  -- Não há rota para conceder papel: o controller de plataforma cria e edita
  -- tenant, lê auditoria e transfere conta, mas não atribui papel. Quem abre
  -- `POST /auth/platform/login` é `role_assignments`, então a linha entra aqui.
  -- A congregação vem da própria conta porque a coluna é NOT NULL — e não
  -- restringe nada: `app_is_platform_support()` não filtra por tenant nem por
  -- congregação.
  INSERT INTO role_assignments
    (id, tenant_id, congregation_id, user_account_id, role_code, updated_at)
  SELECT gen_random_uuid()::text, u.tenant_id, u.congregation_id, u.id,
         'platform_support', now()
    FROM user_accounts u
   WHERE u.email = 'fvargaspf@gmail.com'
     AND NOT EXISTS (
       SELECT 1 FROM role_assignments r
        WHERE r.user_account_id = u.id AND r.role_code = 'platform_support'
     );
END $prov$;

COMMIT;

-- ── Conferência ─────────────────────────────────────────────────────────────
-- Deve listar as duas contas, cada uma no seu tenant, com tenant_admin.
SELECT t.slug, c.name AS congregacao, u.email, u.is_active,
       string_agg(r.role_code, ', ') AS papeis
  FROM tenants t
  JOIN congregations c  ON c.tenant_id = t.id
  JOIN user_accounts u  ON u.tenant_id = t.id AND u.congregation_id = c.id
  LEFT JOIN role_assignments r ON r.user_account_id = u.id
 WHERE t.slug IN ('teste1-church', 'teste2-church')
 GROUP BY t.slug, c.name, u.email, u.is_active
 ORDER BY t.slug;

-- E a conta de plataforma:
SELECT u.email, string_agg(r.role_code, ', ') AS papeis
  FROM user_accounts u
  LEFT JOIN role_assignments r ON r.user_account_id = u.id
 WHERE u.email = 'fvargaspf@gmail.com'
 GROUP BY u.email;
