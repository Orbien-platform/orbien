// Quem gerencia turmas e sessões: liderança da igreja e o líder do ministério
// kids (`ministry_leader`). Spec, "Quem gerencia".
export const KIDS_MANAGE_ROLES = ['tenant_admin', 'admin_congregation', 'pastor', 'secretary', 'ministry_leader'];

// Ler o catálogo e as sessões: a gestão e o voluntário escalado. A operação do
// voluntário (check-in/out da sua sessão) é recortada nos services da F4.
export const KIDS_READ_ROLES = [...KIDS_MANAGE_ROLES, 'volunteer'];

// Rotas de criança/responsável/consentimento: a gestão e o responsável (`member`)
// que cuida só dos próprios filhos. O recorte "só os seus" é do
// KidsChildAccessService, não da lista de papéis. O voluntário escalado lê a
// ficha do que opera na F4 (roster), não por estas rotas.
export const KIDS_FAMILY_ROLES = [...KIDS_MANAGE_ROLES, 'member'];

// Quem recebe o aviso de retirada recusada: a liderança, sem a secretaria
// (que não está no balcão). O `ministry_leader` é o "líder kids" da spec.
export const KIDS_ALERT_ROLES = ['tenant_admin', 'admin_congregation', 'pastor', 'ministry_leader'];
