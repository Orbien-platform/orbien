/**
 * Nome legível de cada papel, para exibir ao usuário. O código do papel
 * (`tenant_admin`) é vocabulário da API, não de quem usa a tela.
 */
export const ROLE_LABELS: Record<string, string> = {
  tenant_admin: "Admin do tenant",
  admin_congregation: "Admin da congregação",
  pastor: "Pastor",
  secretary: "Secretário(a)",
  treasurer: "Tesoureiro(a)",
  cell_leader: "Líder de célula",
  ministry_leader: "Líder de ministério",
  volunteer: "Voluntário(a)",
  member: "Membro",
  platform_support: "Suporte da plataforma",
};

export function roleLabel(code: string): string {
  return ROLE_LABELS[code] ?? code;
}
