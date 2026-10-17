"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/Modal";
import { useAuth } from "@/hooks/useAuth";
import api from "@/lib/api";
import { applyPhoneMask, stripPhone } from "@/lib/phoneMask";

/**
 * Confirmação obrigatória de cadastro, logo depois do login.
 *
 * Se a pessoa da conta não tem sexo, telefone ou data de nascimento, o modal
 * abre sem saída (sem X, Esc ou clique fora) e pede só o que falta. Quem diz o
 * que falta é a API (`GET /me/profile-gaps`); a gravação é `PATCH /me`, o
 * autosserviço do titular. A única outra saída é "Sair da conta".
 *
 * Falha fechada para o usuário, aberta para o produto: se a consulta falhar,
 * o modal não aparece — não dá para bloquear a sessão por um dado que não
 * conseguimos conferir. Sessão de suporte nunca é barrada (a API já devolve
 * vazio), pois quem opera ali não é o titular.
 */

type Gap = "gender" | "phone" | "birth_date";

const GENDER_OPTIONS = [
  { value: "male", label: "Masculino" },
  { value: "female", label: "Feminino" },
  { value: "other", label: "Outro" },
  { value: "prefer_not_to_say", label: "Prefiro não informar" },
];

function todayIso(): string {
  return new Date().toISOString().split("T")[0];
}

export function ProfileGapsGate() {
  const { user, logout } = useAuth();
  const [missing, setMissing] = useState<Gap[]>([]);
  const [gender, setGender] = useState("");
  const [phone, setPhone] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const userId = user?.id;
  const isSupport = user?.support_session === true;

  useEffect(() => {
    if (!userId || isSupport) return;
    let ativo = true;
    api
      .get<{ missing: Gap[] }>("/me/profile-gaps")
      .then(({ data }) => {
        if (ativo && Array.isArray(data.missing)) setMissing(data.missing);
      })
      .catch(() => {});
    return () => {
      ativo = false;
    };
  }, [userId, isSupport]);

  if (missing.length === 0) return null;

  const phoneDigits = stripPhone(phone);
  const valid =
    (!missing.includes("gender") || gender !== "") &&
    (!missing.includes("phone") || phoneDigits.length >= 10) &&
    (!missing.includes("birth_date") ||
      (birthDate >= "1900-01-01" && birthDate <= todayIso()));

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    setError(null);
    const body: Record<string, string> = {};
    if (missing.includes("gender")) body.gender = gender;
    if (missing.includes("phone")) body.phone = phoneDigits;
    if (missing.includes("birth_date")) body.birth_date = birthDate;
    try {
      await api.patch("/me", body);
      setMissing([]);
    } catch {
      setError("Não foi possível salvar. Confira os dados e tente de novo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      dismissible={false}
      onOpenChange={() => {}}
      title="Confirme seus dados"
      description="Precisamos destas informações para continuar. Leva menos de um minuto."
    >
      <form onSubmit={handleSave} className="flex flex-col gap-4">
        {missing.includes("gender") && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="gate-gender" className="text-xs font-medium text-stone">Sexo</Label>
            <select
              id="gate-gender"
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              disabled={saving}
              className="h-8 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] px-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-navy/20 dark:text-white"
            >
              <option value="" disabled>Selecione</option>
              {GENDER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        )}
        {missing.includes("phone") && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="gate-phone" className="text-xs font-medium text-stone">Telefone</Label>
            <Input
              id="gate-phone"
              type="tel"
              placeholder="(11) 99999-9999"
              value={phone}
              onChange={(e) => setPhone(applyPhoneMask(e.target.value))}
              className="rounded-[8px]"
              disabled={saving}
              maxLength={16}
            />
          </div>
        )}
        {missing.includes("birth_date") && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="gate-birth" className="text-xs font-medium text-stone">Data de nascimento</Label>
            <Input
              id="gate-birth"
              type="date"
              value={birthDate}
              max={todayIso()}
              onChange={(e) => setBirthDate(e.target.value)}
              className="rounded-[8px]"
              disabled={saving}
            />
          </div>
        )}

        {error && <p role="alert" className="text-sm text-crimson">{error}</p>}

        <div className="flex items-center justify-between gap-3 pt-1">
          <button
            type="button"
            onClick={() => void logout()}
            className="text-sm text-stone underline-offset-4 hover:underline"
          >
            Sair da conta
          </button>
          <Button type="submit" disabled={!valid || saving} className="rounded-[8px] bg-navy px-4 text-white hover:bg-navy/90">
            {saving ? "Salvando…" : "Confirmar dados"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
