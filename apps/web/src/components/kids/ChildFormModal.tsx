"use client";

import { useCallback, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/Modal";
import { SearchInput } from "@/components/ui/SearchInput";
import { isForbidden } from "@/lib/api";
import { apiErrorMessage } from "@/lib/api-error";
import {
  createChild,
  getConsent,
  searchGuardians,
  updateChild,
  type KidsConsentStatus,
  type KidsFicha,
  type PersonOption,
} from "@/lib/kids";

const TEXTAREA =
  "min-h-[4.5rem] w-full rounded-[8px] border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50";

interface ChildFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `null` cadastra pela secretaria; uma ficha edita os dados da criança. */
  child: KidsFicha | null;
  onSaved: (childId: string) => void;
}

/**
 * Cadastro e edição da criança. No cadastro pela secretaria (KIDS-04 AC 7) o
 * responsável é uma pessoa já cadastrada e, sem consentimento vigente, a
 * secretaria precisa registrar o aceite do termo antes de salvar — a API
 * recusa com 422 se isso faltar.
 */
export function ChildFormModal({ open, onOpenChange, child, onSaved }: ChildFormModalProps) {
  const [name, setName] = useState(child?.full_name ?? "");
  const [birth, setBirth] = useState(child?.birth_date ? child.birth_date.slice(0, 10) : "");
  const [allergies, setAllergies] = useState(child?.allergies ?? "");
  const [notes, setNotes] = useState(child?.medical_notes ?? "");
  const [relationship, setRelationship] = useState("");

  const [candidates, setCandidates] = useState<PersonOption[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [guardian, setGuardian] = useState<PersonOption | null>(null);
  const [consent, setConsent] = useState<KidsConsentStatus | null>(null);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const creating = child === null;
  const needsConsent = creating && consent !== null && !consent.valid;
  const valid =
    name.trim() !== "" &&
    birth !== "" &&
    (!creating || (guardian !== null && consent !== null && (consent.valid || accepted)));

  const search = useCallback((term: string) => {
    setSearchError(null);
    if (term.trim().length < 2) {
      setCandidates(null);
      return;
    }
    searchGuardians(term)
      .then(setCandidates)
      .catch((err) => {
        setCandidates([]);
        setSearchError(
          isForbidden(err)
            ? "Você não tem permissão para buscar responsáveis."
            : apiErrorMessage(err, "Não foi possível buscar pessoas."),
        );
      });
  }, []);

  function choose(person: PersonOption) {
    setGuardian(person);
    setConsent(null);
    setConsentError(null);
    setAccepted(false);
    getConsent(person.id)
      .then(setConsent)
      .catch((err) => setConsentError(apiErrorMessage(err, "Não foi possível conferir o consentimento.")));
  }

  async function save() {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      if (child) {
        await updateChild(child.id, {
          full_name: name.trim(),
          birth_date: birth,
          // Campo esvaziado limpa o dado (`null`); só ausente deixaria como está.
          allergies: allergies.trim() === "" ? null : allergies.trim(),
          medical_notes: notes.trim() === "" ? null : notes.trim(),
        });
        onSaved(child.id);
      } else {
        const created = await createChild({
          full_name: name.trim(),
          birth_date: birth,
          ...(allergies.trim() && { allergies: allergies.trim() }),
          ...(notes.trim() && { medical_notes: notes.trim() }),
          ...(relationship.trim() && { relationship: relationship.trim() }),
          guardian_person_id: guardian!.id,
          ...(needsConsent && { register_consent: true }),
        });
        onSaved(created.id);
      }
      onOpenChange(false);
    } catch (err) {
      setError(apiErrorMessage(err, "Não foi possível salvar a criança."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={creating ? "Nova criança" : "Editar criança"}
      className="max-h-[90vh] max-w-lg overflow-y-auto"
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="c-name" className="text-sm font-medium text-ink dark:text-white">
            Nome da criança
          </Label>
          <Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} disabled={busy} className="rounded-[8px]" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="c-birth" className="text-sm font-medium text-ink dark:text-white">
            Data de nascimento
          </Label>
          <Input
            id="c-birth"
            type="date"
            value={birth}
            onChange={(e) => setBirth(e.target.value)}
            disabled={busy}
            className="rounded-[8px]"
          />
          <span className="text-xs text-stone">Sem ela não dá para conferir a faixa etária da turma.</span>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="c-allergies" className="text-sm font-medium text-ink dark:text-white">
            Alergias e restrições
          </Label>
          <textarea
            id="c-allergies"
            value={allergies}
            onChange={(e) => setAllergies(e.target.value)}
            disabled={busy}
            placeholder="ex: amendoim, lactose"
            className={TEXTAREA}
          />
          <span className="text-xs text-stone">Aparece em destaque para a equipe no balcão e na etiqueta.</span>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="c-notes" className="text-sm font-medium text-ink dark:text-white">
            Observações médicas
          </Label>
          <textarea
            id="c-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={busy}
            className={TEXTAREA}
          />
        </div>

        {creating ? (
          <fieldset className="flex flex-col gap-3 rounded-[12px] border border-[var(--border-default)] p-3">
            <legend className="px-1 text-sm font-medium text-ink dark:text-white">Responsável</legend>
            {guardian ? (
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="font-medium text-ink dark:text-white">{guardian.full_name}</span>
                <button
                  type="button"
                  onClick={() => {
                    setGuardian(null);
                    setConsent(null);
                  }}
                  disabled={busy}
                  className="rounded-[8px] px-2 py-1 text-xs text-stone hover:bg-[var(--surface-subtle)]"
                >
                  Trocar
                </button>
              </div>
            ) : (
              <>
                <SearchInput placeholder="Buscar o responsável pelo nome" onSearch={search} />
                {searchError ? (
                  <p role="alert" className="text-xs text-crimson">
                    {searchError}
                  </p>
                ) : candidates !== null && candidates.length === 0 ? (
                  <p className="text-xs text-stone">Ninguém encontrado. O responsável precisa estar cadastrado em Pessoas.</p>
                ) : null}
                {candidates && candidates.length > 0 ? (
                  <ul className="flex flex-col">
                    {candidates.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => choose(p)}
                          className="w-full rounded-[8px] px-2 py-1.5 text-left text-sm text-ink hover:bg-[var(--surface-subtle)] dark:text-white"
                        >
                          {p.full_name}
                          {p.phone_masked ? (
                            <>
                              {" "}
                              <span className="ml-1 text-xs text-stone">{p.phone_masked}</span>
                            </>
                          ) : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            )}

            {guardian ? (
              <div className="flex flex-col gap-1">
                <Label htmlFor="c-rel" className="text-sm font-medium text-ink dark:text-white">
                  Parentesco
                </Label>
                <Input
                  id="c-rel"
                  value={relationship}
                  onChange={(e) => setRelationship(e.target.value)}
                  disabled={busy}
                  placeholder="ex: mãe, pai, avó"
                  className="rounded-[8px]"
                />
              </div>
            ) : null}

            {consentError ? (
              <p role="alert" className="text-xs text-crimson">
                {consentError}
              </p>
            ) : consent?.valid ? (
              <p role="status" className="text-xs text-teal">
                Consentimento do responsável vigente.
              </p>
            ) : needsConsent ? (
              <div className="flex flex-col gap-2 rounded-[8px] bg-[var(--surface-subtle)] p-3">
                <p className="text-sm font-medium text-ink dark:text-white">Falta o consentimento do responsável</p>
                <p className="text-sm text-stone">{consent.term_text}</p>
                <label className="flex items-start gap-2 text-sm text-ink dark:text-white">
                  <input
                    type="checkbox"
                    checked={accepted}
                    onChange={(e) => setAccepted(e.target.checked)}
                    disabled={busy}
                    className="mt-0.5 accent-[var(--brand)]"
                  />
                  O responsável leu e aceitou o termo. Registro o consentimento em nome dele.
                </label>
              </div>
            ) : null}
          </fieldset>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-crimson">
          {error}
        </p>
      ) : null}

      <div className="mt-5 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          disabled={busy}
          className="rounded-[8px] px-3 py-1.5 text-sm text-stone hover:bg-[var(--surface-subtle)]"
        >
          Voltar
        </button>
        <Button
          type="button"
          onClick={save}
          disabled={busy || !valid}
          className="flex items-center gap-1.5 rounded-[8px] bg-navy px-3 py-1.5 text-sm text-white hover:bg-navy/90 disabled:opacity-50"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : null}
          {creating ? "Cadastrar criança" : "Salvar criança"}
        </Button>
      </div>
    </Modal>
  );
}
