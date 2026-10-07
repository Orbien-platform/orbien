/**
 * Ordem dos papéis atribuíveis, do maior para o menor. Quem concede acesso
 * nunca atribui um papel acima do maior que ele mesmo tem; igual vale.
 * Papel fora da tabela (`platform_support`, desconhecido) vale 0: não dá
 * poder de conceder nada, e não pode ser concedido por aqui.
 */
export const ROLE_RANK: Record<string, number> = {
  tenant_admin: 7,
  admin_congregation: 6,
  pastor: 5,
  secretary: 4,
  treasurer: 4,
  cell_leader: 3,
  ministry_leader: 3,
  volunteer: 2,
  member: 1,
};

export function maxRoleRank(roleCodes: readonly string[]): number {
  return roleCodes.reduce((max, code) => Math.max(max, ROLE_RANK[code] ?? 0), 0);
}
