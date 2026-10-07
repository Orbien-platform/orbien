import { maxRoleRank, ROLE_RANK } from './role-rank';

describe('maxRoleRank', () => {
  it('devolve o maior nível entre os papéis', () => {
    expect(maxRoleRank(['member', 'pastor', 'secretary'])).toBe(ROLE_RANK.pastor);
  });

  it('papel fora da tabela vale 0, e sem papéis também', () => {
    expect(maxRoleRank(['platform_support', 'papel_novo'])).toBe(0);
    expect(maxRoleRank([])).toBe(0);
  });

  it('secretary e treasurer têm o mesmo nível', () => {
    expect(ROLE_RANK.secretary).toBe(ROLE_RANK.treasurer);
  });
});
