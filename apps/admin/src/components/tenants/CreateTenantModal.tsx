"use client";

import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import axios from "axios";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";

/** O bastante do lead da waitlist pra prefiller o formulário. */
export interface WaitlistLead {
  id: string;
  email: string;
  pastor_name: string;
  church_name: string | null;
}

interface CreateTenantModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
  /** Presente quando o tenant nasce de um lead — prefille o form e manda
   * `waitlist_lead_id` no POST, para a API ativar o lead na mesma transação. */
  lead?: WaitlistLead | null;
}

const EMPTY = {
  slug: "",
  name: "",
  email: "",
  congregation_name: "",
  admin_email: "",
  admin_password: "",
};

/** Mesma regra do `ProvisionTenantDto`, para o erro aparecer antes do 400. */
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formFromLead(lead: WaitlistLead | null | undefined): typeof EMPTY {
  if (!lead) return EMPTY;
  const name = lead.church_name ?? lead.pastor_name;
  return {
    ...EMPTY,
    name,
    slug: slugify(name),
    congregation_name: name ? `${name} — Sede` : "",
    admin_email: lead.email,
  };
}

export function CreateTenantModal({
  open,
  onOpenChange,
  onCreated,
  lead,
}: CreateTenantModalProps) {
  // Prefill fixado na montagem: quando `lead` muda, quem chama passa uma
  // `key` diferente (o id do lead) e o React remonta o componente em vez de
  // reaproveitar o estado do lead anterior. Sem isso um `useEffect` faria a
  // mesma coisa disparando setState dentro do próprio efeito.
  const [form, setForm] = useState(() => formFromLead(lead));
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function set(field: keyof typeof EMPTY, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function close() {
    setForm(EMPTY);
    setError("");
    onOpenChange(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    const slug = form.slug.trim().toLowerCase();
    if (!SLUG_RE.test(slug) || slug.length < 3) {
      setError("Slug: só minúsculas, números e hífens, a partir de 3 caracteres.");
      return;
    }
    if (form.admin_password.length < 8) {
      setError("A senha do admin precisa de ao menos 8 caracteres.");
      return;
    }

    setIsSubmitting(true);
    try {
      // `POST /platform/tenants` é atômico: tenant, plano, branding,
      // congregação, conta admin e papel numa transação só. Não existe estado
      // intermediário para a tela tratar — ou criou tudo, ou não criou nada.
      await api.post("/platform/tenants", {
        slug,
        name: form.name.trim(),
        ...(form.email.trim() ? { email: form.email.trim() } : {}),
        congregation_name: form.congregation_name.trim(),
        admin_email: form.admin_email.trim(),
        admin_password: form.admin_password,
        ...(lead ? { waitlist_lead_id: lead.id } : {}),
      });
      close();
      onCreated();
    } catch (err: unknown) {
      const apiMessage =
        axios.isAxiosError(err) &&
        typeof err.response?.data === "object" &&
        err.response?.data !== null &&
        "message" in err.response.data
          ? String((err.response.data as { message: unknown }).message)
          : "";

      if (
        axios.isAxiosError(err) &&
        err.response?.status === 409 &&
        apiMessage.toLowerCase().includes("vinculado a outro tenant")
      ) {
        // O lead foi provisionado por outra aba entre a tela abrir e o submit.
        setError("Este lead já foi provisionado para outro tenant.");
      } else if (axios.isAxiosError(err) && err.response?.status === 409) {
        setError(`Já existe um tenant com o slug "${slug}".`);
      } else if (axios.isAxiosError(err) && err.response?.status === 400) {
        setError("Dados inválidos. Revise os campos.");
      } else {
        setError("Não foi possível criar o tenant. Tente novamente.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
      title={lead ? "Provisionar a partir do lead" : "Novo tenant"}
      description={
        lead
          ? "Cria a igreja, o plano em trial, a congregação sede e a conta do primeiro admin — e marca este lead da waitlist como ativado."
          : "Cria a igreja, o plano em trial, a congregação sede e a conta do primeiro admin."
      }
      className="max-w-lg"
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="name"
            label="Nome da igreja"
            value={form.name}
            onChange={(v) => set("name", v)}
            disabled={isSubmitting}
            placeholder="Igreja Nova"
          />
          <Field
            id="slug"
            label="Slug"
            value={form.slug}
            onChange={(v) => set("slug", v)}
            disabled={isSubmitting}
            placeholder="igreja-nova"
            hint="Vira subdomínio, login e branding. Não muda depois."
          />
        </div>

        <Field
          id="congregation_name"
          label="Congregação sede"
          value={form.congregation_name}
          onChange={(v) => set("congregation_name", v)}
          disabled={isSubmitting}
          placeholder="Igreja Nova — Sede"
        />

        <Field
          id="email"
          label="E-mail de contato (opcional)"
          type="email"
          value={form.email}
          onChange={(v) => set("email", v)}
          disabled={isSubmitting}
          placeholder="contato@igreja-nova.com"
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="admin_email"
            label="E-mail do admin"
            type="email"
            value={form.admin_email}
            onChange={(v) => set("admin_email", v)}
            disabled={isSubmitting}
            placeholder="pastor@igreja-nova.com"
          />
          <Field
            id="admin_password"
            label="Senha inicial"
            type="password"
            value={form.admin_password}
            onChange={(v) => set("admin_password", v)}
            disabled={isSubmitting}
            placeholder="mínimo 8 caracteres"
          />
        </div>

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
                Criando…
              </>
            ) : lead ? (
              "Provisionar"
            ) : (
              "Criar tenant"
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
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  type?: string;
  hint?: string;
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
      {hint && <span className="text-xs text-muted-text">{hint}</span>}
    </div>
  );
}
