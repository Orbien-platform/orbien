"use client";

import { useEffect, useState } from "react";
import { Baby, HeartHandshake, Sigma, UserPlus, Users } from "lucide-react";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { PeriodNavigator } from "@/components/financial/PeriodNavigator";
import { AttendanceFormModal } from "@/components/celebrations/AttendanceFormModal";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { NoAccessState } from "@/components/ui/NoAccessState";
import { PremiumInvite } from "@/components/ui/PremiumInvite";
import { useAuth } from "@/hooks/useAuth";
import api, { isForbidden } from "@/lib/api";
import { formatCivilDate } from "@/lib/datetime";
import { isUpgradeRoute } from "@/lib/permissions";
import { isValidRange, periodFor, type Period } from "@/lib/period";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Counts {
  children: number;
  members: number;
  attendees: number;
  visitors: number;
  total: number;
}

interface Summary {
  services_counted: number;
  totals: Counts;
  average: Counts;
}

interface ServiceRow {
  celebration_instance_id: string;
  scheduled_date: string;
  celebration: { id: string; name: string; start_time: string };
  attendance: Counts | null;
}

interface CelebrationOption {
  id: string;
  name: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const nf = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 0 });
const fmt = (n: number) => nf.format(n);

function fmtDate(iso: string): string {
  return formatCivilDate(iso, { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

/**
 * Indicadores de presença nos cultos. Premium como o restante de Celebrações:
 * na igreja Starter vale o convite, sem pedir à API o que viria 403.
 */
export default function IndicadoresPage() {
  const { user } = useAuth();
  if (isUpgradeRoute(user, "/pessoas/indicadores")) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="page-title">Indicadores</h1>
        <PremiumInvite
          resource="Indicadores"
          description="Acompanhe a média de presença dos cultos por categoria — crianças, membros, frequentadores e visitantes — a partir da contagem lançada por quem está na escala."
        />
      </div>
    );
  }
  return <IndicadoresContent />;
}

function IndicadoresContent() {
  const { user } = useAuth();
  // Corrigir uma contagem é da liderança; a API confere de novo.
  const canCorrect = (user?.roles ?? []).some((r) =>
    ["admin_congregation", "pastor", "tenant_admin", "secretary"].includes(r),
  );

  const [period, setPeriod] = useState<Period>(() => periodFor("quarter"));
  const [celebrationId, setCelebrationId] = useState("");
  const [options, setOptions] = useState<CelebrationOption[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [rows, setRows] = useState<ServiceRow[]>([]);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [denied, setDenied] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState<ServiceRow | null>(null);

  const rangeOk = isValidRange(period.start, period.end);
  const key = `${period.start}|${period.end}|${celebrationId}|${reloadKey}`;
  const isLoading = rangeOk && loadedKey !== key;

  useEffect(() => {
    api
      .get<CelebrationOption[]>("/celebrations")
      .then(({ data }) => setOptions(Array.isArray(data) ? data : []))
      .catch(() => setOptions([]));
  }, []);

  useEffect(() => {
    if (!rangeOk) return;
    const signal = { cancelled: false };
    const params = {
      date_from: period.start,
      date_to: period.end,
      ...(celebrationId && { celebration_id: celebrationId }),
    };
    Promise.all([
      api.get<Summary>("/celebrations/attendance/summary", { params }),
      api.get<ServiceRow[]>("/celebrations/attendance", { params }),
    ])
      .then(([s, l]) => {
        if (signal.cancelled) return;
        setSummary(s.data);
        setRows(Array.isArray(l.data) ? l.data : []);
        setFailed(false);
        setDenied(false);
      })
      .catch((error) => {
        if (signal.cancelled) return;
        setSummary(null);
        setRows([]);
        setDenied(isForbidden(error));
        setFailed(!isForbidden(error));
      })
      .finally(() => {
        if (!signal.cancelled) setLoadedKey(key);
      });
    return () => {
      signal.cancelled = true;
    };
  }, [rangeOk, period.start, period.end, celebrationId, key]);

  if (denied) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="page-title">Indicadores</h1>
        <NoAccessState resource="Indicadores" />
      </div>
    );
  }

  const empty = !isLoading && summary !== null && summary.services_counted === 0;
  const avg = summary?.average;

  const columns: Column<ServiceRow>[] = [
    {
      key: "date",
      header: "Culto",
      render: (r) => (
        <div className="flex flex-col">
          <span className="font-medium text-ink dark:text-white">{r.celebration.name}</span>
          <span className="text-xs text-stone">{fmtDate(r.scheduled_date)}</span>
        </div>
      ),
    },
    ...(
      [
        ["children", "Crianças"],
        ["members", "Membros"],
        ["attendees", "Frequentadores"],
        ["visitors", "Visitantes"],
        ["total", "Total"],
      ] as const
    ).map(([k, header]) => ({
      key: k,
      header,
      render: (r: ServiceRow) =>
        r.attendance ? (
          <span className={k === "total" ? "font-mono font-medium text-ink dark:text-white" : "font-mono"}>
            {r.attendance[k]}
          </span>
        ) : k === "children" ? (
          <span className="text-xs text-stone">Sem contagem</span>
        ) : null,
    })),
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="page-title">Indicadores</h1>
        <p className="text-sm text-stone">
          Presença média nos cultos, a partir da contagem lançada por quem estava na escala.
        </p>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <PeriodNavigator period={period} onChange={setPeriod} />
        <label className="flex flex-col gap-1 text-xs text-stone">
          Celebração
          <select
            value={celebrationId}
            onChange={(e) => setCelebrationId(e.target.value)}
            className="h-8 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] px-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-navy/20 dark:text-white"
          >
            <option value="">Todas</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!rangeOk ? (
        <p className="text-sm text-stone">Informe a data inicial e a final, nessa ordem.</p>
      ) : failed ? (
        <div role="alert" className="rounded-[12px] border border-[var(--border-default)] p-4 text-sm text-crimson">
          Não foi possível carregar a presença.{" "}
          <button type="button" onClick={() => setReloadKey((k) => k + 1)} className="underline">
            Tentar de novo
          </button>
        </div>
      ) : empty ? (
        <div className="rounded-[14px] border border-[var(--border-default)] bg-[var(--surface-base)] px-6 py-10 text-center">
          <Users size={22} strokeWidth={1.5} className="mx-auto text-stone" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium text-ink dark:text-white">Nenhuma contagem neste período</p>
          <p className="mt-1 text-sm text-stone">
            A média aparece quando alguém da escala lança a contagem de um culto. Marque o ministério
            responsável em Ministérios.
          </p>
        </div>
      ) : (
        <>
          <section aria-label="Média por culto" className="flex flex-col gap-3">
            <SectionHeader title={`Média por culto${summary ? ` · ${summary.services_counted} ${summary.services_counted === 1 ? "culto contado" : "cultos contados"}` : ""}`} />
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <KpiCard title="Total" icon={Sigma} mono value={avg ? fmt(avg.total) : "—"} isLoading={isLoading} />
              <KpiCard title="Crianças" icon={Baby} mono value={avg ? fmt(avg.children) : "—"} isLoading={isLoading} />
              <KpiCard title="Membros" icon={Users} mono value={avg ? fmt(avg.members) : "—"} isLoading={isLoading} />
              <KpiCard title="Frequentadores" icon={HeartHandshake} mono value={avg ? fmt(avg.attendees) : "—"} isLoading={isLoading} />
              <KpiCard title="Visitantes" icon={UserPlus} mono value={avg ? fmt(avg.visitors) : "—"} isLoading={isLoading} />
            </div>
            {summary && !isLoading ? (
              <p className="text-xs text-stone">
                No período passaram {fmt(summary.totals.total)} pessoas: {fmt(summary.totals.children)} crianças,{" "}
                {fmt(summary.totals.members)} membros, {fmt(summary.totals.attendees)} frequentadores e{" "}
                {fmt(summary.totals.visitors)} visitantes. Cultos sem contagem não entram na média.
              </p>
            ) : null}
          </section>

          <section aria-label="Cultos do período" className="flex flex-col gap-3">
            <SectionHeader title="Culto a culto" />
            <DataTable
              columns={columns}
              rows={rows}
              getRowKey={(r) => r.celebration_instance_id}
              onRowClick={canCorrect ? (r) => setEditing(r) : undefined}
              isLoading={isLoading}
              skeletonRows={5}
            />
          </section>
        </>
      )}

      {editing ? (
        <AttendanceFormModal
          key={editing.celebration_instance_id}
          open
          onOpenChange={(next) => !next && setEditing(null)}
          instanceId={editing.celebration_instance_id}
          subtitle={`${editing.celebration.name} · ${fmtDate(editing.scheduled_date)}`}
          initial={editing.attendance}
          onSaved={() => setReloadKey((k) => k + 1)}
        />
      ) : null}
    </div>
  );
}
