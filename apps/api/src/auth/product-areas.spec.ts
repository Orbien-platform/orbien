import {
  PRODUCT_AREAS,
  PRODUCT_AREA_READ_ROLES,
  readableAreas,
} from './product-areas';

describe('readableAreas', () => {
  it('devolve só as áreas cujo READ cita algum papel da sessão', () => {
    expect(readableAreas({ roles: ['cell_leader'] })).toEqual(['small_groups']);
    expect(readableAreas({ roles: ['ministry_leader'] })).toEqual([
      'volunteers',
      'celebrations',
    ]);
  });

  it('acumula as áreas de quem tem mais de um papel, sem repetir', () => {
    const areas = readableAreas({ roles: ['treasurer', 'ministry_leader'] });

    expect(areas).toEqual(['persons', 'small_groups', 'financial', 'volunteers', 'celebrations']);
    expect(new Set(areas).size).toBe(areas.length);
  });

  it('`tenant_admin` enxerga todas as áreas', () => {
    expect(readableAreas({ roles: ['tenant_admin'] })).toEqual(PRODUCT_AREAS);
  });

  it('papel desconhecido não abre nada', () => {
    expect(readableAreas({ roles: ['papel_que_nao_existe'] })).toEqual([]);
  });

  it('sessão de suporte enxerga tudo, qualquer que seja o papel', () => {
    expect(readableAreas({ roles: [], support_session: true })).toEqual(PRODUCT_AREAS);
  });

  it('`support_session: false` não é atalho — vale o papel', () => {
    expect(readableAreas({ roles: ['treasurer'], support_session: false })).toEqual([
      'persons',
      'small_groups',
      'financial',
    ]);
  });

  it('a cópia devolvida à sessão de suporte não deixa mexer na lista canônica', () => {
    const areas = readableAreas({ roles: [], support_session: true });
    areas.pop();

    expect(PRODUCT_AREAS).toEqual(Object.keys(PRODUCT_AREA_READ_ROLES));
  });
});
