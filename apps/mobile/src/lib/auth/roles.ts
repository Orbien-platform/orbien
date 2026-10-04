// Nome de cada papel como a pessoa o lê — o código (`cell_leader`) é da API.
const ROLE_LABELS: Record<string, string> = {
  tenant_admin: "Administrador",
  admin_congregation: "Admin. da congregação",
  pastor: "Pastor",
  secretary: "Secretaria",
  ministry_leader: "Líder de ministério",
  cell_leader: "Líder de célula",
  volunteer: "Voluntário",
  member: "Membro",
  platform_support: "Suporte da plataforma",
};

/** Papel desconhecido aparece como veio, em vez de sumir. */
export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}
