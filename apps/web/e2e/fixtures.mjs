/**
 * Dados de apoio para os scripts de e2e, criados e removidos pela própria
 * execução. Nada é deixado atrás — a aba "Próximas" só mostra instâncias
 * futuras, e o seed pode não ter nenhuma.
 */

const API_URL = process.env.E2E_API_URL ?? "http://localhost:3000/api";

function headers(token) {
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

async function call(token, method, path, body) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: headers(token),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    throw new Error(`${method} ${path} → HTTP ${res.status} ${await res.text()}`);
  }
  return res.status === 204 ? null : res.json();
}

/** Data ISO (YYYY-MM-DD) daqui a `days` dias. */
function inDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Garante uma instância de celebração no futuro. Devolve também um `cleanup`
 * que desfaz o que foi criado — e apenas isso: se já existia instância futura,
 * ela é reaproveitada e nada é removido no fim.
 */
export async function ensureUpcomingInstance(token) {
  const existing = await call(token, "GET", `/celebrations/instances?date_from=${inDays(0)}`);
  if (existing.length > 0) {
    return { instance: existing[0], created: false, cleanup: async () => {} };
  }

  const celebrations = await call(token, "GET", "/celebrations");
  if (!Array.isArray(celebrations) || celebrations.length === 0) {
    throw new Error("Nenhuma celebração cadastrada — impossível criar instância de teste.");
  }

  const instance = await call(token, "POST", "/celebrations/instances", {
    celebration_id: celebrations[0].id,
    scheduled_date: inDays(7),
    notes: "instância temporária de e2e",
  });

  return {
    instance,
    created: true,
    cleanup: async () => {
      // A escala, se o teste criou uma, precisa sair antes da instância.
      await fetch(`${API_URL}/celebrations/instances/${instance.id}/schedule`, {
        method: "DELETE",
        headers: headers(token),
      });
      await fetch(`${API_URL}/celebrations/instances/${instance.id}`, {
        method: "DELETE",
        headers: headers(token),
      });
    },
  };
}
