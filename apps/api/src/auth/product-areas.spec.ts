import {
  PRODUCT_AREAS,
  PRODUCT_AREA_READ_ROLES,
  readableAreas,
} from './product-areas';

describe('readableAreas', () => {
  it('devolve só as áreas cujo READ cita algum papel da sessão', () => {
    expect(readableAreas({ roles: ['cell_leader'], plan: 'premium' })).toEqual(['small_groups']);
    expect(readableAreas({ roles: ['ministry_leader'], plan: 'premium' })).toEqual([
      'volunteers',
      'celebrations',
    ]);
  });

  it('acumula as áreas de quem tem mais de um papel, sem repetir', () => {
    const areas = readableAreas({ roles: ['treasurer', 'ministry_leader'], plan: 'premium' });

    expect(areas).toEqual(['persons', 'small_groups', 'financial', 'volunteers', 'celebrations']);
    expect(new Set(areas).size).toBe(areas.length);
  });

  it('`tenant_admin` enxerga todas as áreas no plano Premium', () => {
    expect(readableAreas({ roles: ['tenant_admin'], plan: 'premium' })).toEqual(PRODUCT_AREAS);
  });

  it('papel desconhecido não abre nada', () => {
    expect(readableAreas({ roles: ['papel_que_nao_existe'], plan: 'premium' })).toEqual([]);
  });

  it('sessão de suporte enxerga tudo, qualquer que seja o papel, quando o tenant impersonado é Premium', () => {
    expect(readableAreas({ roles: [], support_session: true, plan: 'premium' })).toEqual(
      PRODUCT_AREAS,
    );
  });

  it('`support_session: false` não é atalho — vale o papel', () => {
    expect(
      readableAreas({ roles: ['treasurer'], support_session: false, plan: 'premium' }),
    ).toEqual(['persons', 'small_groups', 'financial']);
  });

  it('a cópia devolvida à sessão de suporte não deixa mexer na lista canônica', () => {
    const areas = readableAreas({ roles: [], support_session: true, plan: 'premium' });
    areas.pop();

    expect(PRODUCT_AREAS).toEqual(Object.keys(PRODUCT_AREA_READ_ROLES));
  });

  describe('recorte por plano — celebrations é Premium-only (pricing-church-platform.md §5.5)', () => {
    it('Starter perde `celebrations` mesmo com papel que a abriria', () => {
      expect(readableAreas({ roles: ['tenant_admin'], plan: 'starter' })).toEqual(
        PRODUCT_AREAS.filter((area) => area !== 'celebrations'),
      );
    });

    it('`plan` ausente é tratado como não-Premium — nega por padrão', () => {
      expect(readableAreas({ roles: ['tenant_admin'] })).toEqual(
        PRODUCT_AREAS.filter((area) => area !== 'celebrations'),
      );
    });

    it('nenhuma outra área é afetada pelo plano Starter', () => {
      const areas = readableAreas({ roles: ['treasurer', 'ministry_leader'], plan: 'starter' });
      expect(areas).toEqual(['persons', 'small_groups', 'financial', 'volunteers']);
    });

    it('sessão de suporte também perde `celebrations` quando o tenant impersonado é Starter', () => {
      // O plano no token de impersonação é o do tenant ALVO, não o do
      // suporte — a sessão vê o que o cliente vê, não mais que isso.
      expect(readableAreas({ roles: [], support_session: true, plan: 'starter' })).toEqual(
        PRODUCT_AREAS.filter((area) => area !== 'celebrations'),
      );
    });
  });
});
