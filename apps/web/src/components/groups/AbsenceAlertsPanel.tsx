"use client";

import { useEffect, useState } from "react";
import { Loader2, UserCheck, Phone, Mail } from "lucide-react";
import { NoAccessState } from "@/components/ui/NoAccessState";
import api, { isForbidden } from "@/lib/api";

export interface AbsentPerson {
  id: string;
  full_name: string;
  phone?: string | null;
  email?: string | null;
}

/**
 * Alerta de ausência consecutiva (PROD-11) — o lado que o líder abre.
 *
 * `GET /small-groups/:id/absence-alerts` devolve quem, entre os membros da
 * célula, não tem presença em nenhuma das 3 últimas reuniões (menos, se a
 * célula tiver menos). A mesma conta alimenta o push semanal ao líder
 * (`SmallGroupsAbsenceNotifier`); aqui é a consulta sob demanda, para quem
 * quer olhar sem esperar a segunda-feira.
 *
 * O 403 tem tratamento próprio pelo mesmo motivo de `PrayerRequestsPanel`:
 * a rota é dos papéis de liderança + `cell_leader`, e a aba fica escondida
 * para os outros — mas quem perder um papel entre o carregamento da página e
 * o clique precisa ler "sem acesso", não "nenhuma ausência".
 */
export function AbsenceAlertsPanel({ groupId }: { groupId: string }) {
  const [people, setPeople] = useState<AbsentPerson[]>([]);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState("");

  // Mesmo padrão dos outros painéis: "carregando" é derivado de qual
  // requisição já terminou, nunca um setState no corpo do effect.
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const loading = loadedKey !== groupId;

  useEffect(() => {
    const signal = { cancelled: false };
    api
      .get<AbsentPerson[]>(`/small-groups/${groupId}/absence-alerts`)
      .then(({ data }) => {
        if (signal.cancelled) return;
        setPeople(data);
        setForbidden(false);
        setError("");
      })
      .catch((err: unknown) => {
        if (signal.cancelled) return;
        setPeople([]);
        if (isForbidden(err)) {
          setForbidden(true);
          setError("");
        } else {
          setForbidden(false);
          setError("Não foi possível carregar as ausências.");
        }
      })
      .finally(() => {
        if (!signal.cancelled) setLoadedKey(groupId);
      });
    return () => {
      signal.cancelled = true;
    };
  }, [groupId]);

  if (loading) {
    return (
      <div className="flex justify-center py-10" data-testid="absence-loading">
        <Loader2 size={20} className="animate-spin text-stone" />
      </div>
    );
  }

  if (forbidden) return <NoAccessState resource="as ausências desta célula" />;

  if (error) {
    return (
      <p role="alert" className="px-4 py-3 text-sm text-crimson">
        {error}
      </p>
    );
  }

  if (people.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
        <UserCheck size={24} strokeWidth={1.5} className="text-stone" />
        <p className="text-sm text-stone">
          Ninguém ficou de fora das últimas reuniões.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <p className="border-b border-[var(--border-default)] px-4 py-3 text-xs text-stone">
        Sem presença registrada em nenhuma das 3 últimas reuniões da célula.
      </p>
      <ul className="divide-y divide-[var(--border-default)]">
        {people.map((p) => (
          <li key={p.id} className="flex flex-col gap-1 px-4 py-3">
            <span className="text-sm text-ink dark:text-white">{p.full_name}</span>
            {/* Telefone e e-mail viram link: o alerta só vale se o líder
                conseguir falar com a pessoa sem sair da tela. */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone">
              {p.phone && (
                <a href={`tel:${p.phone}`} className="flex items-center gap-1 hover:text-ink dark:hover:text-white">
                  <Phone size={12} strokeWidth={1.5} />
                  {p.phone}
                </a>
              )}
              {p.email && (
                <a href={`mailto:${p.email}`} className="flex items-center gap-1 hover:text-ink dark:hover:text-white">
                  <Mail size={12} strokeWidth={1.5} />
                  {p.email}
                </a>
              )}
              {!p.phone && !p.email && <span>Sem contato cadastrado</span>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
