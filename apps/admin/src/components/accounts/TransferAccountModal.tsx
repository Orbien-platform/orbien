"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";
import { transferErrorMessage } from "./transfer-errors";

export interface TransferRequest {
  accountId: string;
  tenantId: string;
  tenantName: string;
  congregationId: string;
}

export interface TransferResult {
  user_account_id: string;
  previous_tenant_id: string;
  previous_congregation_id: string;
  tenant_id: string;
  congregation_id: string;
}

interface TransferAccountModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTransferred: (result: TransferResult) => void;
  request: TransferRequest | null;
}

// Cada linha é uma coisa que a API de fato faz — ver
// `TransferUserAccountService`. Se o serviço mudar, esta lista muda junto.
const CONSEQUENCES = [
  "A conta e a pessoa passam para o tenant e a congregação de destino.",
  "Todas as sessões da conta caem — a pessoa precisa entrar de novo.",
  "Os papéis que ela tinha no tenant de origem são apagados (platform_support não é tocado). No destino ela começa sem papel.",
  "A operação fica registrada em audit_logs, no tenant de origem.",
];

export function TransferAccountModal({
  open,
  onOpenChange,
  onTransferred,
  request,
}: TransferAccountModalProps) {
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function close() {
    if (isSubmitting) return;
    setError("");
    onOpenChange(false);
  }

  async function handleConfirm() {
    if (!request) return;
    setError("");
    setIsSubmitting(true);
    try {
      const { data } = await api.patch<TransferResult>(
        `/platform/user-accounts/${request.accountId}/transfer`,
        {
          destination_tenant_id: request.tenantId,
          destination_congregation_id: request.congregationId,
        }
      );
      onOpenChange(false);
      onTransferred(data);
    } catch (err: unknown) {
      setError(transferErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={() => close()}
      title="Transferir esta conta?"
      description={
        request ? `A conta vai para ${request.tenantName}.` : undefined
      }
      className="max-w-lg"
    >
      <div className="flex flex-col gap-4">
        {request && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-[8px] bg-[var(--surface-subtle)] px-3 py-2.5 text-xs">
            <dt className="text-stone">Conta</dt>
            <dd className="break-all font-mono text-ink dark:text-white">
              {request.accountId}
            </dd>
            <dt className="text-stone">Congregação</dt>
            <dd className="break-all font-mono text-ink dark:text-white">
              {request.congregationId}
            </dd>
          </dl>
        )}

        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-ink dark:text-white">
          {CONSEQUENCES.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>

        <p className="text-xs text-stone">
          Não há botão de desfazer. Para reverter, é preciso fazer outra
          transferência de volta — e os papéis apagados não voltam.
        </p>

        {error && (
          <p
            className="rounded-[8px] bg-crimson-dim px-3 py-2 text-sm text-crimson"
            role="alert"
          >
            {error}
          </p>
        )}

        <div className="mt-1 flex justify-end gap-2">
          <button
            type="button"
            onClick={close}
            disabled={isSubmitting}
            className="rounded-[8px] px-3 py-2 text-sm font-medium text-stone transition-colors hover:bg-[var(--surface-subtle)] hover:text-ink dark:hover:text-white disabled:opacity-60"
          >
            Cancelar
          </button>
          <Button
            onClick={handleConfirm}
            disabled={isSubmitting}
            className="h-9 rounded-[8px] bg-crimson px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            {isSubmitting ? (
              <>
                <Loader2 size={15} className="mr-2 animate-spin" />
                Transferindo…
              </>
            ) : (
              "Transferir conta"
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
