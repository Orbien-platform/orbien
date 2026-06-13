"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";

interface Category {
  id: string;
  name: string;
  type: "income" | "expense";
  children: Category[];
}

interface NewTransactionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function NewTransactionModal({
  open,
  onOpenChange,
  onCreated,
}: NewTransactionModalProps) {
  const [type, setType] = useState<"income" | "expense">("income");
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [occurredAt, setOccurredAt] = useState(
    () => new Date().toISOString().split("T")[0]
  );
  const [description, setDescription] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const hasFetched = useRef(false);

  useEffect(() => {
    if (!open || hasFetched.current) return;
    hasFetched.current = true;
    api
      .get<Category[]>("/financial/categories")
      .then((r) => setCategories(r.data ?? []))
      .catch(() => {});
  }, [open]);

  const filteredCategories = categories.filter((c) => c.type === type);

  function reset() {
    setType("income");
    setCategoryId("");
    setAmount("");
    setOccurredAt(new Date().toISOString().split("T")[0]);
    setDescription("");
    setError("");
    setSuccess(false);
    hasFetched.current = false;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    const numAmount = parseFloat(
      amount.replace(/[^\d,]/g, "").replace(",", ".")
    );
    if (!description.trim()) { setError("Descrição é obrigatória."); return; }
    if (!amount || isNaN(numAmount) || numAmount <= 0) { setError("Informe um valor válido."); return; }
    if (!occurredAt) { setError("Data é obrigatória."); return; }
    if (!categoryId) { setError("Selecione uma categoria."); return; }

    setIsSubmitting(true);
    try {
      await api.post("/financial/transactions", {
        type,
        category_id: categoryId,
        amount: numAmount,
        occurred_at: new Date(occurredAt + "T12:00:00").toISOString(),
        description: description.trim(),
      });
      setSuccess(true);
      setTimeout(() => {
        onCreated();
        onOpenChange(false);
        reset();
      }, 1200);
    } catch {
      setError("Erro ao registrar lançamento. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}
      title="Novo lançamento"
      description="Registre uma entrada ou saída financeira."
    >
      {success ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <CheckCircle2 size={40} className="text-teal" strokeWidth={1.5} />
          <p className="text-sm font-medium text-ink dark:text-white">
            Lançamento registrado!
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
                onClick={() => { setType(t); setCategoryId(""); }}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${
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
              disabled={isSubmitting}
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
              <Input
                id="nt-amount"
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={isSubmitting}
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
              disabled={isSubmitting}
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
              disabled={isSubmitting}
              className="rounded-[8px]"
            />
          </div>

          {error && (
            <p className="rounded-[8px] bg-crimson-dim px-3 py-2 text-sm text-crimson">
              {error}
            </p>
          )}

          <div className="flex gap-2 pt-1">
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
              ) : (
                "Registrar"
              )}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
