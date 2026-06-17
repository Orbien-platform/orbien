"use client";

import { useState, type FormEvent } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";
import { applyPhoneMask, stripPhone } from "@/lib/phoneMask";

interface CreateVisitorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function CreateVisitorModal({
  open,
  onOpenChange,
  onCreated,
}: CreateVisitorModalProps) {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  function reset() {
    setFullName("");
    setPhone("");
    setEmail("");
    setError("");
    setSuccess(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!fullName.trim()) { setError("Nome é obrigatório."); return; }
    if (stripPhone(phone).length < 10) { setError("Informe um telefone válido."); return; }

    setIsSubmitting(true);
    try {
      await api.post("/persons", {
        full_name: fullName.trim(),
        phone: stripPhone(phone) || undefined,
        email: email.trim() || undefined,
        classification: "visitor",
      });
      setSuccess(true);
      setTimeout(() => {
        onCreated();
        onOpenChange(false);
        reset();
      }, 1200);
    } catch {
      setError("Erro ao cadastrar. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}
      title="Cadastrar visitante"
      description="Dados básicos do visitante. Você pode completar o perfil depois."
    >
      {success ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <CheckCircle2 size={40} className="text-teal" strokeWidth={1.5} />
          <p className="text-sm font-medium text-ink dark:text-white">Visitante cadastrado!</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cv-name" className="text-sm font-medium text-ink dark:text-white">
              Nome completo <span className="text-crimson">*</span>
            </Label>
            <Input
              id="cv-name"
              placeholder="ex: Maria Silva"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              disabled={isSubmitting}
              className="rounded-[8px]"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cv-phone" className="text-sm font-medium text-ink dark:text-white">
              Telefone <span className="text-crimson">*</span>
            </Label>
            <Input
              id="cv-phone"
              type="tel"
              placeholder="(11) 99999-9999"
              value={phone}
              onChange={(e) => setPhone(applyPhoneMask(e.target.value))}
              disabled={isSubmitting}
              className="rounded-[8px]"
              maxLength={16}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cv-email" className="text-sm font-medium text-ink dark:text-white">
              E-mail <span className="text-stone text-xs font-normal">(opcional)</span>
            </Label>
            <Input
              id="cv-email"
              type="email"
              placeholder="visitante@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isSubmitting}
              className="rounded-[8px]"
            />
          </div>

          {error && (
            <p className="rounded-[8px] bg-crimson-dim px-3 py-2 text-sm text-crimson">{error}</p>
          )}

          <p className="text-xs text-stone">
            Ao cadastrar, você confirma que o visitante autorizou o uso dos dados.
          </p>

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
              className="flex-1 rounded-[8px] bg-navy text-white hover:bg-[var(--color-navy-dark)]"
            >
              {isSubmitting ? <Loader2 size={15} className="animate-spin" /> : "Cadastrar"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
