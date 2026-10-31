"use client";

import { useEffect, useState } from "react";
import { Loader2, Pencil, Plus, ShieldCheck, ShieldOff, Trash2 } from "lucide-react";
import { AllergyNote } from "@/components/kids/AllergyNote";
import { ChildFormModal } from "@/components/kids/ChildFormModal";
import { GuardianFormModal } from "@/components/kids/GuardianFormModal";
import { Button } from "@/components/ui/button";
import {
  DetailPage,
  DetailPageContent,
  DetailPageDescription,
  DetailPageHeader,
  DetailPageTitle,
} from "@/components/ui/detail-page";
import { Modal } from "@/components/ui/Modal";
import { NoAccessState } from "@/components/ui/NoAccessState";
import { isForbidden } from "@/lib/api";
import { apiErrorMessage } from "@/lib/api-error";
import {
  ageInMonths,
  formatAge,
  getChild,
  getConsent,
  registerConsent,
  removeGuardian,
  revokeConsent,
  type KidsConsentStatus,
  type KidsFicha,
  type KidsGuardian,
} from "@/lib/kids";
import { formatCivilDate } from "@/lib/datetime";

interface ChildFichaProps {
  childId: string;
  canManage: boolean;
  onBack: () => void;
  /** A ficha mudou (nome, por exemplo): a lista por trás precisa recarregar. */
  onChanged: () => void;
}

/**
 * Ficha da criança (KIDS-04/05/07): alergia em destaque, responsáveis e
 * terceiros autorizados, consentimento. Ler esta ficha pela equipe é um acesso
 * a dado de saúde e a API o audita.
 */
export function ChildFicha({ childId, canManage, onBack, onChanged }: ChildFichaProps) {
  const [ficha, setFicha] = useState<KidsFicha | null>(null);
  const [failed, setFailed] = useState(false);
  const [denied, setDenied] = useState(false);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [consent, setConsent] = useState<KidsConsentStatus | null>(null);
  const [editingChild, setEditingChild] = useState(false);
  const [guardianForm, setGuardianForm] = useState<KidsGuardian | "new" | null>(null);
  const [removing, setRemoving] = useState<KidsGuardian | null>(null);
  const [consentDialog, setConsentDialog] = useState<"register" | "revoke" | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const key = `${childId}|${reloadKey}`;
  const isLoading = loadedKey !== key;

  useEffect(() => {
    const signal = { cancelled: false };
    getChild(childId)
      .then(async (f) => {
        if (signal.cancelled) return;
        setFicha(f);
        setFailed(false);
        setDenied(false);
        // O consentimento é do responsável primário. Sem ele (ou se a leitura
        // falhar) a ficha segue — o bloco só diz que não deu para conferir.
        const primary = f.guardians.find((g) => g.is_primary);
        setConsent(null);
        if (primary) {
          try {
            const c = await getConsent(primary.guardian_person_id);
            if (!signal.cancelled) setConsent(c);
          } catch {
            // Sem consentimento lido, o bloco mostra o aviso de indisponível.
          }
        }
      })
      .catch((err) => {
        if (signal.cancelled) return;
        setFicha(null);
        setDenied(isForbidden(err));
        setFailed(!isForbidden(err));
      })
      .finally(() => {
        if (!signal.cancelled) setLoadedKey(key);
      });
    return () => {
      signal.cancelled = true;
    };
  }, [childId, key]);

  const reload = () => {
    onChanged();
    setReloadKey((k) => k + 1);
  };

  async function run(action: () => Promise<void>, fallback: string, after: () => void) {
    setBusy(true);
    setError(null);
    try {
      await action();
      after();
      reload();
    } catch (err) {
      setError(apiErrorMessage(err, fallback));
    } finally {
      setBusy(false);
    }
  }

  const primary = ficha?.guardians.find((g) => g.is_primary) ?? null;

  return (
    <>
      <DetailPage open onOpenChange={(next) => !next && onBack()} backLabel="Voltar para crianças">
        <DetailPageContent>
          {isLoading ? (
            <div className="flex min-h-[16rem] items-center justify-center" role="status" aria-label="Carregando a ficha">
              <Loader2 size={24} className="animate-spin text-stone" />
            </div>
          ) : denied ? (
            <NoAccessState resource="fichas de crianças" />
          ) : failed || !ficha ? (
            <div role="alert" className="p-6 text-sm text-crimson">
              Não foi possível carregar a ficha.{" "}
              <button type="button" onClick={() => setReloadKey((k) => k + 1)} className="underline">
                Tentar de novo
              </button>
            </div>
          ) : (
            <div className="flex flex-col">
              <DetailPageHeader className="border-b border-[var(--border-default)] px-4 pb-4 pt-6">
                <DetailPageTitle className="pr-8 text-base font-medium text-ink dark:text-white">
                  {ficha.full_name}
                </DetailPageTitle>
                <DetailPageDescription className="text-xs text-stone">
                  {ficha.birth_date
                    ? `${formatAge(ageInMonths(ficha.birth_date))} · nasceu em ${formatCivilDate(ficha.birth_date, { day: "2-digit", month: "2-digit", year: "numeric" })}`
                    : "Sem data de nascimento"}
                </DetailPageDescription>
                {canManage ? (
                  <button
                    type="button"
                    onClick={() => setEditingChild(true)}
                    className="-ml-2 mt-2 flex w-fit items-center gap-1.5 rounded-[8px] px-2 py-1 text-xs text-stone hover:bg-[var(--surface-subtle)] hover:text-ink dark:hover:text-white"
                  >
                    <Pencil size={13} strokeWidth={1.5} />
                    Editar criança
                  </button>
                ) : null}
              </DetailPageHeader>

              <section aria-label="Saúde" className="flex flex-col gap-2 border-b border-[var(--border-default)] px-4 py-4">
                <h2 className="text-sm font-medium text-ink dark:text-white">Saúde</h2>
                {ficha.allergies ? (
                  <AllergyNote allergy={ficha.allergies} className="w-fit" />
                ) : (
                  <p className="text-sm text-stone">Nenhuma alergia informada.</p>
                )}
                {ficha.medical_notes ? (
                  <p className="text-sm text-stone">
                    <span className="font-medium text-ink dark:text-white">Observações: </span>
                    {ficha.medical_notes}
                  </p>
                ) : null}
              </section>

              <section aria-label="Responsáveis" className="flex flex-col border-b border-[var(--border-default)]">
                <div className="flex items-center gap-2 px-4 py-3">
                  <h2 className="text-sm font-medium text-ink dark:text-white">
                    Responsáveis e autorizados ({ficha.guardians.length})
                  </h2>
                  {canManage ? (
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setGuardianForm("new");
                      }}
                      className="ml-auto flex items-center gap-1.5 rounded-[8px] px-2 py-1 text-xs text-stone hover:bg-[var(--surface-subtle)] hover:text-ink dark:hover:text-white"
                    >
                      <Plus size={13} strokeWidth={1.5} />
                      Autorizar uma pessoa
                    </button>
                  ) : null}
                </div>
                <ul className="flex flex-col divide-y divide-[var(--border-default)] border-t border-[var(--border-default)]">
                  {ficha.guardians.map((g) => (
                    <li key={g.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="text-sm font-medium text-ink dark:text-white">{g.full_name}</span>
                        <span className="text-xs text-stone">
                          {g.relationship}
                          {g.phone ? ` · ${g.phone}` : ""}
                        </span>
                      </div>
                      {g.is_primary ? (
                        <span className="rounded-full bg-navy-dim px-2 py-0.5 text-xs font-medium text-navy">Primário</span>
                      ) : null}
                      <span
                        className={
                          g.can_pickup
                            ? "rounded-full bg-teal-dim px-2 py-0.5 text-xs font-medium text-teal"
                            : "rounded-full bg-[var(--surface-subtle)] px-2 py-0.5 text-xs font-medium text-stone"
                        }
                      >
                        {g.can_pickup ? "Pode buscar" : "Não busca"}
                      </span>
                      {canManage ? (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setError(null);
                              setGuardianForm(g);
                            }}
                            aria-label={`Editar ${g.full_name}`}
                            className="rounded-[6px] p-1.5 text-stone outline-none hover:bg-[var(--surface-subtle)] hover:text-ink focus-visible:ring-2 focus-visible:ring-ring/50"
                          >
                            <Pencil size={14} strokeWidth={1.5} />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setError(null);
                              setRemoving(g);
                            }}
                            aria-label={`Remover ${g.full_name}`}
                            className="rounded-[6px] p-1.5 text-stone outline-none hover:bg-crimson-dim hover:text-crimson focus-visible:ring-2 focus-visible:ring-ring/50"
                          >
                            <Trash2 size={14} strokeWidth={1.5} />
                          </button>
                        </>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>

              <section aria-label="Consentimento" className="flex flex-col gap-2 px-4 py-4">
                <h2 className="text-sm font-medium text-ink dark:text-white">Consentimento do responsável</h2>
                {primary === null ? (
                  <p className="text-sm text-stone">A criança não tem responsável primário.</p>
                ) : consent === null ? (
                  <p className="text-sm text-stone">Não foi possível conferir o consentimento de {primary.full_name}.</p>
                ) : consent.valid ? (
                  <p className="flex items-center gap-1.5 text-sm text-teal">
                    <ShieldCheck size={15} strokeWidth={1.8} aria-hidden="true" />
                    {primary.full_name} consentiu com o termo. Dá para fazer o check-in.
                  </p>
                ) : (
                  <p className="flex items-center gap-1.5 text-sm text-amber-ink">
                    <ShieldOff size={15} strokeWidth={1.8} aria-hidden="true" />
                    {primary.full_name} ainda não consentiu. Sem o consentimento não há check-in.
                  </p>
                )}
                {canManage && primary && consent ? (
                  <div>
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setAccepted(false);
                        setConsentDialog(consent.valid ? "revoke" : "register");
                      }}
                      className="rounded-full border border-[var(--border-strong)] px-3 py-1 text-xs font-medium text-ink outline-none transition-colors hover:border-teal hover:text-teal focus-visible:ring-2 focus-visible:ring-ring/50 dark:text-white"
                    >
                      {consent.valid ? "Revogar consentimento" : "Registrar consentimento"}
                    </button>
                  </div>
                ) : null}
              </section>
            </div>
          )}
        </DetailPageContent>
      </DetailPage>

      {editingChild && ficha ? (
        <ChildFormModal open onOpenChange={(next) => !next && setEditingChild(false)} child={ficha} onSaved={reload} />
      ) : null}

      {guardianForm ? (
        <GuardianFormModal
          key={guardianForm === "new" ? "new" : guardianForm.id}
          open
          onOpenChange={(next) => !next && setGuardianForm(null)}
          childId={childId}
          guardian={guardianForm === "new" ? null : guardianForm}
          onSaved={reload}
        />
      ) : null}

      <Modal
        open={removing !== null}
        onOpenChange={(next) => !next && setRemoving(null)}
        title="Remover este responsável?"
        description={removing?.full_name}
      >
        <p className="text-sm text-stone">
          A pessoa deixa de poder buscar esta criança. A criança precisa continuar com ao menos um responsável primário.
        </p>
        {error ? (
          <p role="alert" className="mt-3 text-sm text-crimson">
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setRemoving(null)}
            disabled={busy}
            className="rounded-[8px] px-3 py-1.5 text-sm text-stone hover:bg-[var(--surface-subtle)]"
          >
            Voltar
          </button>
          <Button
            type="button"
            onClick={() =>
              removing &&
              run(() => removeGuardian(removing.id), "Não foi possível remover o responsável.", () => setRemoving(null))
            }
            disabled={busy}
            className="flex items-center gap-1.5 rounded-[8px] bg-navy px-3 py-1.5 text-sm text-white hover:bg-navy/90 disabled:opacity-50"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : null}
            Remover responsável
          </Button>
        </div>
      </Modal>

      <Modal
        open={consentDialog !== null}
        onOpenChange={(next) => !next && setConsentDialog(null)}
        title={consentDialog === "revoke" ? "Revogar o consentimento?" : "Registrar consentimento"}
        description={primary?.full_name}
      >
        {consentDialog === "revoke" ? (
          <p className="text-sm text-stone">
            Sem consentimento vigente não há novos check-ins. O histórico de presença fica até o prazo de retenção.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-stone">{consent?.term_text}</p>
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
        )}
        {error ? (
          <p role="alert" className="mt-3 text-sm text-crimson">
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setConsentDialog(null)}
            disabled={busy}
            className="rounded-[8px] px-3 py-1.5 text-sm text-stone hover:bg-[var(--surface-subtle)]"
          >
            Voltar
          </button>
          <Button
            type="button"
            onClick={() => {
              if (!primary || !consent) return;
              const id = primary.guardian_person_id;
              void run(
                () => (consentDialog === "revoke" ? revokeConsent(id) : registerConsent(id, consent.term_version)),
                "Não foi possível atualizar o consentimento.",
                () => setConsentDialog(null),
              );
            }}
            disabled={busy || (consentDialog === "register" && !accepted)}
            className="flex items-center gap-1.5 rounded-[8px] bg-navy px-3 py-1.5 text-sm text-white hover:bg-navy/90 disabled:opacity-50"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : null}
            {consentDialog === "revoke" ? "Revogar consentimento" : "Registrar consentimento"}
          </Button>
        </div>
      </Modal>
    </>
  );
}
