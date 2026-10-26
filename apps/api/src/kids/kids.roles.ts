// Quem gerencia turmas e sessões: liderança da igreja e o líder do ministério
// kids (`ministry_leader`). Spec, "Quem gerencia".
export const KIDS_MANAGE_ROLES = ['tenant_admin', 'admin_congregation', 'pastor', 'secretary', 'ministry_leader'];

// Ler o catálogo e as sessões: a gestão e o voluntário escalado. A operação do
// voluntário (check-in/out da sua sessão) é recortada nos services da F4.
export const KIDS_READ_ROLES = [...KIDS_MANAGE_ROLES, 'volunteer'];
