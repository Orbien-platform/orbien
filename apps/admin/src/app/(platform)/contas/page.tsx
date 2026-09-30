"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  TransferAccountModal,
  type TransferRequest,
  type TransferResult,
} from "@/components/accounts/TransferAccountModal";
import api from "@/lib/api";

interface TenantOption {
  id: string;
  slug: string;
  name: string;
  is_active: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SELECT_CLS =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50";

export default function ContasPage() {
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [loadError, setLoadError] = useState("");
  const [accountId, setAccountId] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [congregationId, setCongregationId] = useState("");
  const [formError, setFormError] = useState("");
  const [request, setRequest] = useState<TransferRequest | null>(null);
  const [done, setDone] = useState<TransferResult | null>(null);

  useEffect(() => {
    const signal = { cancelled: false };
    api
      .get<{ data: TenantOption[] }>("/platform/tenants?limit=100")
      .then(({ data }) => {
        if (!signal.cancelled) setTenants(data.data.filter((t) => t.is_active));
      })
      .catch(() => {
        if (!signal.cancelled) {
          setLoadError("Não foi possível carregar os tenants de destino.");
        }
      });
    return () => {
      signal.cancelled = true;
    };
  }, []);

  function handleReview(e: FormEvent) {
    e.preventDefault();
    setFormError("");
    setDone(null);

    const account = accountId.trim();
    const congregation = congregationId.trim();
    if (!UUID.test(account)) {
      setFormError("O ID da conta precisa ser um UUID válido.");
      return;
    }
    const tenant = tenants.find((t) => t.id === tenantId);
    if (!tenant) {
      setFormError("Escolha o tenant de destino.");
      return;
    }
    if (!UUID.test(congregation)) {
      setFormError("O ID da congregação de destino precisa ser um UUID válido.");
      return;
    }
    setRequest({
      accountId: account,
      tenantId: tenant.id,
      tenantName: tenant.name,
      congregationId: congregation,
    });
  }

  function handleTransferred(result: TransferResult) {
    setDone(result);
    setAccountId("");
    setTenantId("");
    setCongregationId("");
  }

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <div>
        <h1 className="text-lg font-medium text-ink dark:text-white">Contas</h1>
        <p className="text-sm text-stone">
          Move uma conta de usuário para outra igreja. A plataforma ainda não
          tem busca de contas nem de congregações: os dois IDs vêm de fora
          (pedido de suporte ou banco).
        </p>
      </div>

      {done && (
        <p
          className="rounded-[8px] bg-teal-dim px-3 py-2 text-sm text-teal"
          role="status"
        >
          Conta <span className="font-mono">{done.user_account_id}</span>{" "}
          transferida. As sessões dela foram encerradas.
        </p>
      )}

      <form onSubmit={handleReview} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="account-id">ID da conta</Label>
          <Input
            id="account-id"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="font-mono"
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="destination-tenant">Tenant de destino</Label>
          <select
            id="destination-tenant"
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            className={SELECT_CLS}
          >
            <option value="">Escolha uma igreja</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.slug})
              </option>
            ))}
          </select>
          {loadError && (
            <p className="text-xs text-crimson" role="alert">
              {loadError}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="destination-congregation">
            ID da congregação de destino
          </Label>
          <Input
            id="destination-congregation"
            value={congregationId}
            onChange={(e) => setCongregationId(e.target.value)}
            className="font-mono"
            autoComplete="off"
            spellCheck={false}
          />
          <p className="text-xs text-stone">
            Precisa ser uma congregação do tenant escolhido.
          </p>
        </div>

        {formError && (
          <p
            className="rounded-[8px] bg-crimson-dim px-3 py-2 text-sm text-crimson"
            role="alert"
          >
            {formError}
          </p>
        )}

        <div>
          <Button
            type="submit"
            className="h-9 rounded-[8px] bg-navy px-4 text-sm font-medium text-white hover:bg-[var(--color-navy-dark)]"
          >
            Revisar transferência
          </Button>
        </div>
      </form>

      <TransferAccountModal
        open={request !== null}
        onOpenChange={() => setRequest(null)}
        onTransferred={handleTransferred}
        request={request}
      />
    </div>
  );
}
