"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import axios from "axios";
import { Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/CurrencyInput";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NoAccessState } from "@/components/ui/NoAccessState";
import api, { isForbidden } from "@/lib/api";
import { formatInstant } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import { DonorPicker, type DonorOption } from "./DonorPicker";

interface PixSubscription {
  id: string;
  amount: string;
  description: string | null;
  status: "active" | "cancelled";
  created_at: string;
  cancelled_at: string | null;
  donorPerson?: { full_name: string } | null;
}

function fmt(n: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(n);
}

function fmtDate(iso: string): string {
  return formatInstant(iso, { day: "2-digit", month: "2-digit", year: "numeric" });
}

// 4xx traz mensagem escrita para o usuário ("Igreja não configurou chave PIX");
// 5xx e rede caem no texto genérico.
function apiMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err) && err.response && err.response.status >= 400 && err.response.status < 500) {
    const message = err.response.data?.message;
    if (typeof message === "string") return message;
    if (Array.isArray(message) && typeof message[0] === "string") return message[0];
  }
  return fallback;
}

/**
 * PIX recorrente — dízimo automático via Asaas (Premium, `PROD-27`). O
 * tesoureiro cria em nome de um doador já cadastrado; a Asaas cobra todo mês
 * sozinha. Cancelar chama a Asaas, por isso pede confirmação explícita.
 */
export function PixSubscriptionsPanel() {
  const [rows, setRows] = useState<PixSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const requestSeq = useRef(0);
  const hasFetched = useRef(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [donor, setDonor] = useState<DonorOption | null>(null);
  const [amount, setAmount] = useState(0);
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");

  const [confirmCancel, setConfirmCancel] = useState<PixSubscription | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState("");

  const load = useCallback(() => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setLoadError(false);
    api
      .get<PixSubscription[]>("/financial/pix/subscriptions")
      .then((res) => {
        if (seq !== requestSeq.current) return;
        setRows(res.data ?? []);
        setAccessDenied(false);
      })
      .catch((err) => {
        if (seq !== requestSeq.current) return;
        if (isForbidden(err)) setAccessDenied(true);
        else setLoadError(true);
      })
      .finally(() => {
        if (seq === requestSeq.current) setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    load();
  }, [load]);

  function openCreate() {
    setDonor(null);
    setAmount(0);
    setDescription("");
    setFormError("");
    setCreateOpen(true);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!donor) {
      setFormError("Escolha o doador.");
      return;
    }
    if (amount <= 0) {
      setFormError("Informe um valor maior que zero.");
      return;
    }
    setFormError("");
    setCreating(true);
    try {
      await api.post("/financial/pix/subscriptions", {
        donor_person_id: donor.id,
        amount,
        ...(description.trim() ? { description: description.trim() } : {}),
      });
      setCreateOpen(false);
      load();
    } catch (err) {
      setFormError(apiMessage(err, "Não foi possível criar a assinatura. Tente de novo."));
    } finally {
      setCreating(false);
    }
  }

  async function handleCancel() {
    if (!confirmCancel) return;
    setCancelError("");
    setCancelling(true);
    try {
      await api.patch(`/financial/pix/subscriptions/${confirmCancel.id}/cancel`);
      setConfirmCancel(null);
      load();
    } catch (err) {
      setCancelError(apiMessage(err, "Não foi possível cancelar na Asaas. A assinatura continua ativa."));
    } finally {
      setCancelling(false);
    }
  }

  if (accessDenied) {
    return (
      <div className="rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-card)]">
        <NoAccessState resource="PIX recorrente" />
      </div>
    );
  }

  const cols: Column<PixSubscription>[] = [
    {
      key: "donor",
      header: "Doador",
      render: (r) => (
        <div>
          <p className="font-medium text-ink dark:text-white">{r.donorPerson?.full_name ?? "—"}</p>
          {r.description && <p className="text-xs text-stone">{r.description}</p>}
        </div>
      ),
    },
    {
      key: "amount",
      header: "Todo mês",
      width: "120px",
      render: (r) => <span className="tabular-nums text-ink dark:text-white">{fmt(Number(r.amount))}</span>,
    },
    {
      key: "since",
      header: "Desde",
      width: "110px",
      render: (r) => <span className="text-stone">{fmtDate(r.created_at)}</span>,
    },
    {
      key: "status",
      header: "Situação",
      width: "110px",
      render: (r) => (
        <span
          className={cn(
            "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
            r.status === "active" ? "bg-teal-dim text-teal" : "bg-[var(--surface-subtle)] text-stone",
          )}
        >
          {r.status === "active" ? "Ativa" : "Cancelada"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Ações",
      width: "110px",
      render: (r) =>
        r.status === "active" ? (
          <Button
            variant="outline"
            size="sm"
            className="rounded-[8px]"
            aria-label={`Cancelar assinatura de ${r.donorPerson?.full_name ?? "doador"}`}
            onClick={() => {
              setCancelError("");
              setConfirmCancel(r);
            }}
          >
            Cancelar
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-ink dark:text-white">PIX recorrente</p>
          <p className="mt-0.5 text-xs text-stone">Dízimo automático: a Asaas cobra o doador todo mês por PIX.</p>
        </div>
        <Button
          size="sm"
          className="gap-1.5 rounded-[8px] bg-navy text-white hover:bg-[var(--color-navy-dark)]"
          onClick={openCreate}
        >
          <Plus size={14} strokeWidth={1.5} />
          Nova assinatura
        </Button>
      </div>

      <DataTable
        columns={cols}
        rows={rows}
        getRowKey={(r) => r.id}
        isLoading={loading}
        skeletonRows={4}
        emptyState="Nenhuma assinatura ainda. Crie uma em nome de um doador cadastrado."
        error={loadError ? "Erro ao carregar as assinaturas." : undefined}
        onRetry={load}
      />

      {/* Criar */}
      <Dialog.Root open={createOpen} onOpenChange={(v) => { if (!creating) setCreateOpen(v); }}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/20 backdrop-blur-[2px] transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
          <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-[16px] border border-[var(--border-default)] bg-[var(--surface-base)] p-6 shadow-[var(--shadow-lg)] transition duration-150 data-ending-style:opacity-0 data-ending-style:scale-95 data-starting-style:opacity-0 data-starting-style:scale-95">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <Dialog.Title className="text-base font-medium text-ink dark:text-white">
                  Nova assinatura PIX
                </Dialog.Title>
                <Dialog.Description className="mt-0.5 text-sm text-stone">
                  A primeira cobrança vence amanhã e as seguintes se repetem todo mês.
                </Dialog.Description>
              </div>
              <Dialog.Close
                aria-label="Fechar"
                className="flex h-7 w-7 items-center justify-center rounded-[8px] text-stone transition-colors hover:bg-[var(--surface-subtle)] hover:text-ink"
              >
                <X size={15} strokeWidth={1.5} />
              </Dialog.Close>
            </div>
            <form onSubmit={handleCreate} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="sub-donor">Doador</Label>
                <DonorPicker id="sub-donor" value={donor} onChange={setDonor} disabled={creating} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sub-amount">Valor mensal</Label>
                <CurrencyInput id="sub-amount" value={amount} onValueChange={setAmount} disabled={creating} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sub-description">Descrição (opcional)</Label>
                <Input
                  id="sub-description"
                  value={description}
                  disabled={creating}
                  placeholder="Dízimo automático via Orbien"
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              {formError && (
                <p role="alert" className="text-xs text-crimson">
                  {formError}
                </p>
              )}
              <div className="flex gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 rounded-[8px]"
                  disabled={creating}
                  onClick={() => setCreateOpen(false)}
                >
                  Voltar
                </Button>
                <Button
                  type="submit"
                  disabled={creating}
                  className="flex-1 rounded-[8px] bg-navy text-white hover:bg-[var(--color-navy-dark)]"
                >
                  {creating ? <Loader2 size={14} className="animate-spin" /> : "Criar assinatura"}
                </Button>
              </div>
            </form>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Cancelar — chama a Asaas, então pede confirmação */}
      <Dialog.Root
        open={confirmCancel !== null}
        onOpenChange={(v) => { if (!v && !cancelling) setConfirmCancel(null); }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-[70] bg-black/40 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
          <Dialog.Popup className="fixed left-1/2 top-1/2 z-[70] w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-base)] p-5 shadow-[var(--shadow-lg)] transition duration-150 data-ending-style:opacity-0 data-ending-style:scale-95 data-starting-style:opacity-0 data-starting-style:scale-95">
            <Dialog.Title className="text-sm font-medium text-ink dark:text-white">
              Cancelar a assinatura de {confirmCancel?.donorPerson?.full_name ?? "este doador"}?
            </Dialog.Title>
            <Dialog.Description className="mt-1.5 text-sm text-stone">
              A cobrança mensal de {confirmCancel ? fmt(Number(confirmCancel.amount)) : ""} é cancelada na Asaas e
              o doador deixa de ser cobrado. Não dá para reativar: seria preciso criar outra assinatura.
            </Dialog.Description>
            {cancelError && (
              <p role="alert" className="mt-2 text-xs text-crimson">
                {cancelError}
              </p>
            )}
            <div className="mt-4 flex gap-2">
              <Button
                variant="outline"
                className="flex-1 rounded-[8px]"
                disabled={cancelling}
                onClick={() => setConfirmCancel(null)}
              >
                Manter assinatura
              </Button>
              <Button
                className="flex-1 rounded-[8px] bg-crimson text-white hover:opacity-90"
                disabled={cancelling}
                onClick={handleCancel}
              >
                {cancelling ? <Loader2 size={14} className="animate-spin" /> : "Cancelar assinatura"}
              </Button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
