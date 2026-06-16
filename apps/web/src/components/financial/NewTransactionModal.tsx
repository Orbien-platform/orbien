"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/CurrencyInput";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";

interface Category {
  id: string;
  name: string;
  type: "income" | "expense";
  children: Category[];
}

interface EditableTransaction {
  id: string;
  type: "income" | "expense";
  amount: string | number;
  occurred_at: string;
  description: string;
  category_id: string | null;
  recurring_rule_id?: string | null;
  status?: "pending" | "confirmed";
}

function editKindLabel(tx: EditableTransaction): string {
  if (!tx.recurring_rule_id) return "Avulso";
  return /\(\d+\/\d+\)$/.test(tx.description) ? "Parcelado" : "Fixo mensal";
}

interface NewTransactionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
  editTransaction?: EditableTransaction | null;
  scope?: "this" | "this_and_future";
  viewOnly?: boolean;
}

export function NewTransactionModal({
  open,
  onOpenChange,
  onCreated,
  editTransaction = null,
  scope,
  viewOnly = false,
}: NewTransactionModalProps) {
  const isEditing = !!editTransaction;
  const fieldsDisabled = viewOnly;
  const [type, setType] = useState<"income" | "expense">("income");
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState(0);
  const [occurredAt, setOccurredAt] = useState(
    () => new Date().toISOString().split("T")[0]
  );
  const [description, setDescription] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState("Lançamento registrado!");
  const [entryMode, setEntryMode] = useState<"single" | "installment" | "fixed">("single");
  const [installments, setInstallments] = useState(2);
  const [loadedEditId, setLoadedEditId] = useState<string | null>(null);
  const hasFetched = useRef(false);

  useEffect(() => {
    if (!open || hasFetched.current) return;
    hasFetched.current = true;
    api
      .get<Category[]>("/financial/categories")
      .then((r) => setCategories(r.data ?? []))
      .catch(() => {});
  }, [open]);

  if (open && editTransaction && editTransaction.id !== loadedEditId) {
    setLoadedEditId(editTransaction.id);
    setType(editTransaction.type);
    setCategoryId(editTransaction.category_id ?? "");
    setAmount(Number(editTransaction.amount));
    setOccurredAt(editTransaction.occurred_at.slice(0, 10));
    setDescription(editTransaction.description);
    setEntryMode("single");
  }

  const filteredCategories = categories.filter((c) => c.type === type);

  function reset() {
    setType("income");
    setCategoryId("");
    setAmount(0);
    setOccurredAt(new Date().toISOString().split("T")[0]);
    setDescription("");
    setError("");
    setSuccess(false);
    setSuccessMessage("Lançamento registrado!");
    setEntryMode("single");
    setInstallments(2);
    setLoadedEditId(null);
    hasFetched.current = false;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (!description.trim()) { setError("Descrição é obrigatória."); return; }
    if (!amount || amount <= 0) { setError("Informe um valor válido."); return; }
    if (!occurredAt) { setError("Data é obrigatória."); return; }
    if (!categoryId) { setError("Selecione uma categoria."); return; }

    if (entryMode === "installment" && (!installments || installments < 2 || installments > 60)) {
      setError("Número de parcelas deve ser entre 2 e 60.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (isEditing) {
        const qs = scope ? `?scope=${scope}` : "";
        await api.patch(`/financial/transactions/${editTransaction!.id}${qs}`, {
          type,
          category_id: categoryId,
          amount,
          occurred_at: new Date(occurredAt + "T12:00:00").toISOString(),
          description: description.trim(),
        });
        setSuccessMessage(
          scope === "this_and_future"
            ? "Lançamento e próximos atualizados com sucesso"
            : "Lançamento atualizado com sucesso"
        );
      } else if (entryMode === "single") {
        await api.post("/financial/transactions", {
          type,
          category_id: categoryId,
          amount,
          occurred_at: new Date(occurredAt + "T12:00:00").toISOString(),
          description: description.trim(),
        });
        setSuccessMessage("Lançamento registrado!");
      } else if (entryMode === "installment") {
        await api.post("/financial/recurring-rules", {
          mode: "installment",
          frequency: "monthly",
          installments,
          started_at: new Date(occurredAt + "T12:00:00").toISOString(),
          amount,
          type,
          category_id: categoryId,
          description: description.trim(),
        });
        setSuccessMessage(`Lançamento parcelado em ${installments}x criado com sucesso`);
      } else {
        await api.post("/financial/recurring-rules", {
          mode: "fixed",
          frequency: "monthly",
          started_at: new Date(occurredAt + "T12:00:00").toISOString(),
          amount,
          type,
          category_id: categoryId,
          description: description.trim(),
        });
        setSuccessMessage("Lançamento fixo mensal criado com sucesso");
      }
      setSuccess(true);
      setTimeout(() => {
        onCreated();
        onOpenChange(false);
        reset();
      }, 1200);
    } catch {
      setError(
        isEditing
          ? "Erro ao atualizar lançamento. Tente novamente."
          : "Erro ao registrar lançamento. Tente novamente."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}
      title={viewOnly ? "Visualizar lançamento" : isEditing ? "Editar lançamento" : "Novo lançamento"}
      description={
        viewOnly
          ? "Lançamento confirmado em uma exportação contábil — somente leitura."
          : isEditing
            ? "Atualize os dados desta entrada ou saída financeira."
            : "Registre uma entrada ou saída financeira."
      }
    >
      {success ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <CheckCircle2 size={40} className="text-teal" strokeWidth={1.5} />
          <p className="text-sm font-medium text-ink dark:text-white">
            {successMessage}
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          {/* Type toggle */}
          <div className="flex overflow-hidden rounded-[8px] border border-[var(--border-default)]">
            {(["income", "expense"] as const).map((t) => (
              <button
                key={t}
                type="button"
                disabled={fieldsDisabled}
                onClick={() => { setType(t); setCategoryId(""); }}
                className={`flex-1 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                  type === t
                    ? t === "income"
                      ? "bg-teal text-white"
                      : "bg-crimson text-white"
                    : "bg-[var(--surface-base)] text-stone hover:bg-[var(--surface-subtle)]"
                }`}
              >
                {t === "income" ? "Entrada" : "Saída"}
              </button>
            ))}
          </div>

          {/* Category */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-sm font-medium text-ink dark:text-white">
              Categoria <span className="text-crimson">*</span>
            </Label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              disabled={isSubmitting || fieldsDisabled}
              className="h-9 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] px-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-navy/20 dark:text-white"
            >
              <option value="">— Selecione —</option>
              {filteredCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Amount */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nt-amount" className="text-sm font-medium text-ink dark:text-white">
              Valor <span className="text-crimson">*</span>
            </Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-stone">
                R$
              </span>
              <CurrencyInput
                id="nt-amount"
                value={amount}
                onValueChange={setAmount}
                disabled={isSubmitting || fieldsDisabled}
                className="rounded-[8px] pl-9"
              />
            </div>
          </div>

          {/* Date */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nt-date" className="text-sm font-medium text-ink dark:text-white">
              Data <span className="text-crimson">*</span>
            </Label>
            <Input
              id="nt-date"
              type="date"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
              disabled={isSubmitting || fieldsDisabled}
              className="rounded-[8px]"
            />
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nt-desc" className="text-sm font-medium text-ink dark:text-white">
              Descrição <span className="text-crimson">*</span>
            </Label>
            <Input
              id="nt-desc"
              placeholder="ex: Dízimos do culto de domingo"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isSubmitting || fieldsDisabled}
              className="rounded-[8px]"
            />
          </div>

          {/* Recurrence */}
          {isEditing ? (
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm font-medium text-ink dark:text-white">
                Tipo de lançamento
              </Label>
              <Input
                value={editKindLabel(editTransaction!)}
                disabled
                readOnly
                className="rounded-[8px] text-stone"
              />
              <p className="text-xs text-stone">
                O tipo de lançamento é definido na criação e não pode ser alterado aqui.
              </p>
              {!viewOnly && editTransaction?.recurring_rule_id && (
                <p className="rounded-[8px] bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  Este lançamento faz parte de uma série recorrente.
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm font-medium text-ink dark:text-white">
                Tipo de lançamento
              </Label>
              <select
                value={entryMode}
                onChange={(e) => setEntryMode(e.target.value as typeof entryMode)}
                disabled={isSubmitting}
                className="h-9 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] px-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-navy/20 dark:text-white"
              >
                <option value="single">Avulso</option>
                <option value="installment">Parcelado</option>
                <option value="fixed">Fixo mensal</option>
              </select>
            </div>
          )}

          {!isEditing && entryMode === "installment" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="nt-installments" className="text-sm font-medium text-ink dark:text-white">
                Número de parcelas <span className="text-crimson">*</span>
              </Label>
              <Input
                id="nt-installments"
                type="number"
                min={2}
                max={60}
                value={installments}
                onChange={(e) => setInstallments(parseInt(e.target.value, 10) || 0)}
                disabled={isSubmitting}
                className="rounded-[8px]"
              />
            </div>
          )}

          {error && (
            <p className="rounded-[8px] bg-crimson-dim px-3 py-2 text-sm text-crimson">
              {error}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            {viewOnly ? (
              <Button
                type="button"
                variant="outline"
                className="flex-1 rounded-[8px]"
                onClick={() => onOpenChange(false)}
              >
                Fechar
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 rounded-[8px]"
                  onClick={() => onOpenChange(false)}
                  disabled={isSubmitting}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className={`flex-1 rounded-[8px] text-white ${
                    type === "income"
                      ? "bg-teal hover:opacity-90"
                      : "bg-crimson hover:opacity-90"
                  }`}
                >
                  {isSubmitting ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : isEditing ? (
                    "Salvar"
                  ) : (
                    "Registrar"
                  )}
                </Button>
              </>
            )}
          </div>
        </form>
      )}
    </Modal>
  );
}
