"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { Building2, Image as ImageIcon, Loader2, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import api from "@/lib/api";
import { applyPhoneMask, initPhone, stripPhone } from "@/lib/phoneMask";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Settings {
  tenant: { name: string; email: string | null; phone: string | null };
  branding: {
    app_name: string | null;
    primary_color: string | null;
    logo_url: string | null;
    splash_url: string | null;
  };
  congregation: {
    name: string;
    address: string | null;
    timezone: string;
    email: string | null;
    phone: string | null;
  };
}

interface UpdateSettingsPayload {
  tenant?: { name?: string; email?: string; phone?: string };
  congregation?: {
    name?: string;
    address?: string;
    timezone?: string;
    email?: string;
    phone?: string;
    app_name?: string;
    primary_color?: string;
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TIMEZONE_OPTIONS = [
  { value: "America/Noronha", label: "Fernando de Noronha (UTC−2)" },
  { value: "America/Sao_Paulo", label: "Brasília (UTC−3)" },
  { value: "America/Bahia", label: "Bahia (UTC−3)" },
  { value: "America/Fortaleza", label: "Fortaleza (UTC−3)" },
  { value: "America/Recife", label: "Recife (UTC−3)" },
  { value: "America/Belem", label: "Belém (UTC−3)" },
  { value: "America/Araguaina", label: "Araguaína (UTC−3)" },
  { value: "America/Maceio", label: "Maceió (UTC−3)" },
  { value: "America/Campo_Grande", label: "Campo Grande (UTC−4)" },
  { value: "America/Cuiaba", label: "Cuiabá (UTC−4)" },
  { value: "America/Santarem", label: "Santarém (UTC−3)" },
  { value: "America/Porto_Velho", label: "Porto Velho (UTC−4)" },
  { value: "America/Boa_Vista", label: "Boa Vista (UTC−4)" },
  { value: "America/Manaus", label: "Manaus (UTC−4)" },
  { value: "America/Eirunepe", label: "Eirunepé (UTC−5)" },
  { value: "America/Rio_Branco", label: "Rio Branco (UTC−5)" },
];

const ALLOWED_LOGO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/svg+xml"];
const MAX_LOGO_SIZE = 5 * 1024 * 1024; // 5MB
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HEX_COLOR_RE = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Field({
  label,
  full = false,
  children,
}: {
  label: string;
  full?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", full && "sm:col-span-2")}>
      <Label className="text-xs font-medium text-stone uppercase tracking-wide">{label}</Label>
      {children}
    </div>
  );
}

const selectCls =
  "h-8 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] px-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-navy/20 dark:text-white disabled:cursor-not-allowed disabled:opacity-50";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ConfiguracoesPage() {
  const { user } = useAuth();
  const canEditTenant = user?.roles?.includes("tenant_admin") ?? false;
  const canEditCongregation =
    canEditTenant || (user?.roles?.includes("admin_congregation") ?? false);

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const hasFetched = useRef(false);

  // Congregação
  const [congName, setCongName] = useState("");
  const [congAddress, setCongAddress] = useState("");
  const [congTimezone, setCongTimezone] = useState("America/Sao_Paulo");
  const [congEmail, setCongEmail] = useState("");
  const [congPhone, setCongPhone] = useState("");

  // Identidade visual
  const [appName, setAppName] = useState("");
  const [primaryColor, setPrimaryColor] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Organização (tenant)
  const [tenantName, setTenantName] = useState("");
  const [tenantEmail, setTenantEmail] = useState("");
  const [tenantPhone, setTenantPhone] = useState("");

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [toastMsg, setToastMsg] = useState("");

  function showToast(msg: string) {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 3000);
  }

  function applySettings(data: Settings) {
    setCongName(data.congregation.name ?? "");
    setCongAddress(data.congregation.address ?? "");
    setCongTimezone(data.congregation.timezone || "America/Sao_Paulo");
    setCongEmail(data.congregation.email ?? "");
    setCongPhone(initPhone(data.congregation.phone ?? undefined));

    setAppName(data.branding.app_name ?? "");
    setPrimaryColor(data.branding.primary_color ?? "");
    setLogoUrl(data.branding.logo_url ?? null);

    setTenantName(data.tenant.name ?? "");
    setTenantEmail(data.tenant.email ?? "");
    setTenantPhone(initPhone(data.tenant.phone ?? undefined));
  }

  const load = useCallback(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    setIsLoading(true);
    setLoadError("");
    api
      .get<Settings>("/settings")
      .then((res) => applySettings(res.data))
      .catch(() => setLoadError("Erro ao carregar configurações."))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    return () => {
      if (logoPreview) URL.revokeObjectURL(logoPreview);
    };
  }, [logoPreview]);

  function onLogoSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
      showToast("Formato não suportado. Use JPG, PNG, WEBP ou SVG.");
      return;
    }
    if (file.size > MAX_LOGO_SIZE) {
      showToast("Arquivo muito grande. Máximo: 5MB.");
      return;
    }
    if (logoPreview) URL.revokeObjectURL(logoPreview);
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  }

  async function handleSave() {
    setSaveError("");

    if (canEditCongregation && !congName.trim()) {
      setSaveError("Nome da congregação é obrigatório.");
      return;
    }
    if (congEmail.trim() && !EMAIL_RE.test(congEmail.trim())) {
      setSaveError("E-mail da congregação inválido.");
      return;
    }
    if (canEditTenant && tenantEmail.trim() && !EMAIL_RE.test(tenantEmail.trim())) {
      setSaveError("E-mail da organização inválido.");
      return;
    }
    if (primaryColor.trim() && !HEX_COLOR_RE.test(primaryColor.trim())) {
      setSaveError("Cor principal deve ser um código hexadecimal válido (ex: #1C3D5A).");
      return;
    }

    setIsSaving(true);
    try {
      const payload: UpdateSettingsPayload = {};
      if (canEditCongregation) {
        payload.congregation = {
          name: congName.trim(),
          address: congAddress.trim() || undefined,
          timezone: congTimezone,
          email: congEmail.trim() || undefined,
          phone: stripPhone(congPhone) || undefined,
          app_name: appName.trim() || undefined,
          primary_color: primaryColor.trim() || undefined,
        };
      }
      if (canEditTenant) {
        payload.tenant = {
          name: tenantName.trim(),
          email: tenantEmail.trim() || undefined,
          phone: stripPhone(tenantPhone) || undefined,
        };
      }

      const { data } = await api.patch<Settings>("/settings", payload);
      applySettings(data);

      if (logoFile) {
        const formData = new FormData();
        formData.append("file", logoFile);
        const { data: logoRes } = await api.post<{ logo_url: string }>(
          "/settings/logo",
          formData
        );
        setLogoUrl(logoRes.logo_url);
        if (logoPreview) URL.revokeObjectURL(logoPreview);
        setLogoFile(null);
        setLogoPreview(null);
        if (logoInputRef.current) logoInputRef.current.value = "";
      }

      showToast("Configurações salvas com sucesso.");
    } catch {
      setSaveError("Erro ao salvar configurações. Tente novamente.");
    } finally {
      setIsSaving(false);
    }
  }

  const canEditAny = canEditCongregation || canEditTenant;
  const timezoneOptions = TIMEZONE_OPTIONS.some((o) => o.value === congTimezone)
    ? TIMEZONE_OPTIONS
    : [...TIMEZONE_OPTIONS, { value: congTimezone, label: congTimezone }];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-medium text-ink dark:text-white">Configurações</h1>
        <p className="mt-0.5 text-sm text-stone">
          Dados da congregação, identidade visual e organização
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-44 w-full rounded-[12px]" />
          <Skeleton className="h-48 w-full rounded-[12px]" />
          <Skeleton className="h-36 w-full rounded-[12px]" />
        </div>
      ) : loadError ? (
        <p className="py-10 text-center text-sm text-crimson">{loadError}</p>
      ) : (
        <>
          {/* ── Congregação ── */}
          <section className="rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-card)] p-5">
            <div className="mb-4 flex items-center gap-2">
              <Building2 size={16} strokeWidth={1.5} className="text-navy" />
              <h2 className="text-sm font-medium text-ink dark:text-white">Congregação</h2>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Nome *" full>
                <Input
                  value={congName}
                  onChange={(e) => setCongName(e.target.value)}
                  disabled={!canEditCongregation || isSaving}
                  className="rounded-[8px]"
                />
              </Field>
              <Field label="Endereço" full>
                <Input
                  value={congAddress}
                  onChange={(e) => setCongAddress(e.target.value)}
                  disabled={!canEditCongregation || isSaving}
                  className="rounded-[8px]"
                />
              </Field>
              <Field label="Fuso horário">
                <select
                  value={congTimezone}
                  onChange={(e) => setCongTimezone(e.target.value)}
                  disabled={!canEditCongregation || isSaving}
                  className={selectCls}
                >
                  {timezoneOptions.map((tz) => (
                    <option key={tz.value} value={tz.value}>
                      {tz.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="E-mail">
                <Input
                  type="email"
                  value={congEmail}
                  onChange={(e) => setCongEmail(e.target.value)}
                  disabled={!canEditCongregation || isSaving}
                  className="rounded-[8px]"
                />
              </Field>
              <Field label="Telefone">
                <Input
                  type="tel"
                  placeholder="(11) 99999-9999"
                  value={congPhone}
                  onChange={(e) => setCongPhone(applyPhoneMask(e.target.value))}
                  maxLength={16}
                  disabled={!canEditCongregation || isSaving}
                  className="rounded-[8px]"
                />
              </Field>
            </div>
          </section>

          {/* ── Identidade visual ── */}
          <section className="rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-card)] p-5">
            <div className="mb-4 flex items-center gap-2">
              <Palette size={16} strokeWidth={1.5} className="text-navy" />
              <h2 className="text-sm font-medium text-ink dark:text-white">Identidade visual</h2>
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-[var(--border-default)] bg-[var(--surface-subtle)]">
                  {logoPreview || logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={logoPreview ?? logoUrl ?? ""}
                      alt="Logotipo"
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <ImageIcon size={22} strokeWidth={1.5} className="text-stone" />
                  )}
                </div>
                {canEditCongregation && (
                  <div className="flex flex-col gap-1.5">
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/svg+xml"
                      onChange={onLogoSelected}
                      disabled={isSaving}
                      className="hidden"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-[8px]"
                      onClick={() => logoInputRef.current?.click()}
                      disabled={isSaving}
                    >
                      Alterar logotipo
                    </Button>
                    <p className="text-xs text-stone">JPG, PNG, WEBP ou SVG · máx. 5MB</p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Nome do app">
                  <Input
                    value={appName}
                    onChange={(e) => setAppName(e.target.value)}
                    placeholder={tenantName}
                    disabled={!canEditCongregation || isSaving}
                    className="rounded-[8px]"
                  />
                </Field>
                <Field label="Cor principal">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={HEX_COLOR_RE.test(primaryColor) ? primaryColor : "#1c3d5a"}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      disabled={!canEditCongregation || isSaving}
                      className="h-8 w-10 cursor-pointer rounded-[6px] border border-[var(--border-default)] bg-transparent disabled:cursor-not-allowed disabled:opacity-50"
                    />
                    <Input
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      placeholder="#1C3D5A"
                      disabled={!canEditCongregation || isSaving}
                      className="rounded-[8px]"
                    />
                  </div>
                </Field>
              </div>
            </div>
          </section>

          {/* ── Organização ── */}
          <section className="rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-card)] p-5">
            <h2 className="text-sm font-medium text-ink dark:text-white">Organização</h2>
            <p className="mb-4 mt-0.5 text-xs text-stone">
              {canEditTenant
                ? "Dados compartilhados entre todas as congregações da organização."
                : "Apenas administradores da organização podem editar esses dados."}
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Nome" full>
                <Input
                  value={tenantName}
                  onChange={(e) => setTenantName(e.target.value)}
                  disabled={!canEditTenant || isSaving}
                  className="rounded-[8px]"
                />
              </Field>
              <Field label="E-mail">
                <Input
                  type="email"
                  value={tenantEmail}
                  onChange={(e) => setTenantEmail(e.target.value)}
                  disabled={!canEditTenant || isSaving}
                  className="rounded-[8px]"
                />
              </Field>
              <Field label="Telefone">
                <Input
                  type="tel"
                  placeholder="(11) 99999-9999"
                  value={tenantPhone}
                  onChange={(e) => setTenantPhone(applyPhoneMask(e.target.value))}
                  maxLength={16}
                  disabled={!canEditTenant || isSaving}
                  className="rounded-[8px]"
                />
              </Field>
            </div>
          </section>

          {saveError && (
            <p className="rounded-[8px] bg-crimson-dim px-3 py-2 text-sm text-crimson">{saveError}</p>
          )}

          {canEditAny && (
            <div className="flex justify-end">
              <Button
                onClick={handleSave}
                disabled={isSaving}
                className="gap-1.5 rounded-[8px] bg-navy text-white hover:bg-[var(--color-navy-dark)]"
              >
                {isSaving && <Loader2 size={14} className="animate-spin" />}
                Salvar alterações
              </Button>
            </div>
          )}
        </>
      )}

      {toastMsg && (
        <div className="fixed bottom-4 right-4 z-50 rounded-[8px] bg-ink px-4 py-2.5 text-sm text-white shadow-lg dark:bg-white dark:text-ink">
          {toastMsg}
        </div>
      )}
    </div>
  );
}
