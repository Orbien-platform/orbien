"use client";

import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import axios from "axios";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";

export interface EditableTenant {
  id: string;
  name: string;
  email: string | null;
}

interface EditTenantModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
  tenant: EditableTenant | null;
}

export function EditTenantModal({
  open,
  onOpenChange,
  onUpdated,
  tenant,
}: EditTenantModalProps) {
  // Remonta com `key={tenant.id}` em quem chama — o mesmo desenho do prefill
  // do `CreateTenantModal` a partir do lead, e pelo mesmo motivo: sem isso um
  // segundo tenant aberto reaproveitaria o estado do primeiro.
  //
  // Sem campo de telefone: `GET /platform/tenants` não devolve `phone` de
  // propósito (é dado de contato fora da listagem — ver `ListTenantsService`),
  // e prefiller um campo vazio aqui mandaria string vazia no PATCH, apagando
  // um telefone que a tela nunca chegou a ver.
  const [form, setForm] = useState({
    name: tenant?.name ?? "",
    email: tenant?.email ?? "",
  });
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function set(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function close() {
    setError("");
    onOpenChange(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (!tenant) return;

    const name = form.name.trim();
    if (name.length < 2) {
      setError("Informe o nome da igreja.");
      return;
    }

    setIsSubmitting(true);
    try {
      await api.patch(`/platform/tenants/${tenant.id}`, {
        name,
        // Vazio limpa o campo — mas `email` não aceita string vazia (é
        // `@IsEmail()` no DTO), então omitido quando limpo.
        ...(form.email.trim() ? { email: form.email.trim() } : {}),
      });
      close();
      onUpdated();
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.status === 400) {
        setError("Dados inválidos. Revise os campos.");
      } else if (axios.isAxiosError(err) && err.response?.status === 404) {
        setError("Este tenant não existe mais.");
      } else {
        setError("Não foi possível salvar. Tente novamente.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
      title="Editar tenant"
      description="Nome e e-mail de contato da igreja. Slug e plano não mudam por aqui."
      className="max-w-lg"
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <Field
          id="edit-name"
          label="Nome da igreja"
          value={form.name}
          onChange={(v) => set("name", v)}
          disabled={isSubmitting}
          placeholder="Igreja Nova"
        />

        <Field
          id="edit-email"
          label="E-mail de contato"
          type="email"
          value={form.email}
          onChange={(v) => set("email", v)}
          disabled={isSubmitting}
          placeholder="contato@igreja-nova.com"
        />

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
            type="submit"
            disabled={isSubmitting}
            className="h-9 rounded-[8px] bg-navy px-4 text-sm font-medium text-white hover:bg-[var(--color-navy-dark)] disabled:opacity-60"
          >
            {isSubmitting ? (
              <>
                <Loader2 size={15} className="mr-2 animate-spin" />
                Salvando…
              </>
            ) : (
              "Salvar"
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  disabled,
  placeholder,
  type = "text",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-sm font-medium text-ink dark:text-white">
        {label}
      </Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className="rounded-[8px]"
      />
    </div>
  );
}
