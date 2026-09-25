"use client";

import { Suspense, useCallback, useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";
import { Building2, CheckCircle2, CloudCog, Globe, Image as ImageIcon, Loader2, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import api, { isForbidden } from "@/lib/api";
import { applyPhoneMask, initPhone, stripPhone } from "@/lib/phoneMask";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Settings {
  tenant: { name: string; email: string | null; phone: string | null };
  branding: {
    app_name: string | null;
    primary_color: string | null;
    accent_color: string | null;
    logo_url: string | null;
    logo_url_dark: string | null;
    splash_url: string | null;
    custom_domain: string | null;
    terms_url: string | null;
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
    accent_color?: string;
  };
  branding?: { custom_domain?: string; terms_url?: string };
}

interface DomainStatus {
  custom_domain: string | null;
  status: "pending" | "verified" | "failed";
  cloudflare_connected: boolean;
  manual_instructions: {
    cname: { name: string; value: string };
    apex_alternative: { name: string; type: "A"; value: string };
    note: string;
  } | null;
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

// Contraste AA (4.5:1) da cor principal contra branco. A API barra de todo
// jeito (IsAccessibleBrandColor, em apps/api/src/common/validators/), mas
// avisar aqui evita um round-trip só para descobrir — e o texto que explica
// o porquê caberia mal numa mensagem de erro de servidor.
//
// A cor principal é fundo de CTA com texto branco no app e no web, e cor de
// texto sobre papel branco no PDF da escala (pdf-export.service.ts): a mesma
// razão cobre os dois usos, porque contraste é simétrico.
const AA_CONTRAST = 4.5;

function relativeLuminance(hex: string): number {
  const raw = hex.trim().slice(1);
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;
  const linear = [0, 2, 4].map((offset) => {
    const channel = parseInt(full.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.03928
      ? channel / 12.92
      : Math.pow((channel + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastWithWhite(hex: string): number {
  return 1.05 / (relativeLuminance(hex) + 0.05);
}

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
      <Label className="text-xs font-medium text-stone">{label}</Label>
      {children}
    </div>
  );
}

const selectCls =
  "h-8 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] px-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-navy/20 dark:text-white disabled:cursor-not-allowed disabled:opacity-50";

// ─── Page ─────────────────────────────────────────────────────────────────────

// `useSearchParams` (leitura do `?dominio=` que volta do OAuth da
// Cloudflare) exige Suspense boundary no App Router — daqui pra baixo é o
// conteúdo de verdade; o export default só embrulha.
function ConfiguracoesContent() {
  const { user } = useAuth();
  const canEditTenant = user?.roles?.includes("tenant_admin") ?? false;
  const canEditCongregation =
    canEditTenant || (user?.roles?.includes("admin_congregation") ?? false);

  // Mesmo padrão do Header (sem guard de hidratação): `next-themes` já
  // injeta o script que aplica a classe antes do primeiro paint.
  const { resolvedTheme } = useTheme();
  const isDarkPreview = resolvedTheme === "dark";

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
  const [accentColor, setAccentColor] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const [logoUrlDark, setLogoUrlDark] = useState<string | null>(null);
  const [logoFileDark, setLogoFileDark] = useState<File | null>(null);
  const [logoPreviewDark, setLogoPreviewDark] = useState<string | null>(null);
  const logoInputRefDark = useRef<HTMLInputElement>(null);

  // Organização (tenant)
  const [tenantName, setTenantName] = useState("");
  const [tenantEmail, setTenantEmail] = useState("");
  const [tenantPhone, setTenantPhone] = useState("");

  // Domínio próprio (Premium) — carregado à parte de `/settings`: sem
  // Premium a rota responde 403, e é essa falha (não `user.plan`, que o web
  // nem carrega hoje) que decide se a seção aparece.
  const [customDomain, setCustomDomain] = useState("");
  const [domainStatus, setDomainStatus] = useState<DomainStatus | null>(null);
  const [domainAvailable, setDomainAvailable] = useState(false);
  const [isSavingDomain, setIsSavingDomain] = useState(false);
  const [isVerifyingDomain, setIsVerifyingDomain] = useState(false);
  const [isConnectingCloudflare, setIsConnectingCloudflare] = useState(false);
  const [domainError, setDomainError] = useState("");

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
    setAccentColor(data.branding.accent_color ?? "");
    setLogoUrl(data.branding.logo_url ?? null);
    setLogoUrlDark(data.branding.logo_url_dark ?? null);
    setCustomDomain(data.branding.custom_domain ?? "");

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

  const loadDomainStatus = useCallback(() => {
    api
      .get<DomainStatus>("/settings/branding/domain")
      .then((res) => {
        setDomainAvailable(true);
        setDomainStatus(res.data);
      })
      .catch((err) => {
        // 403 = plano não é Premium — seção fica de fora, mesmo silêncio do
        // resto da base quando um recurso Premium não se aplica (PROD-20).
        // Qualquer outro erro (500, rede) é falha de verdade: esconder do
        // mesmo jeito faria um admin Premium achar que não tem o recurso.
        setDomainAvailable(false);
        if (!isForbidden(err)) {
          setDomainError("Erro ao carregar o status do domínio. Recarregue a página.");
        }
      });
  }, []);

  useEffect(() => {
    if (canEditTenant) loadDomainStatus();
  }, [canEditTenant, loadDomainStatus]);

  // Volta do redirect da Cloudflare (`.../callback` no backend redireciona
  // pra cá com `?dominio=conectado|erro`) — refaz o status e limpa o
  // parâmetro, pra um refresh da página não repetir o toast.
  const searchParams = useSearchParams();
  useEffect(() => {
    const dominio = searchParams?.get("dominio");
    if (!dominio) return;
    loadDomainStatus();
    // `setTimeout` de propósito: chamar `showToast` direto aqui é setState
    // síncrono dentro do efeito (o lint de `react-hooks` barra) — o toast
    // não precisa aparecer no mesmo tick, só depois que o efeito terminou.
    setTimeout(() => {
      showToast(
        dominio === "conectado"
          ? "Cloudflare conectada — verificando o domínio."
          : "Não foi possível conectar com a Cloudflare. Tente novamente.",
      );
    }, 0);
    window.history.replaceState(null, "", window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    return () => {
      if (logoPreview) URL.revokeObjectURL(logoPreview);
    };
  }, [logoPreview]);

  useEffect(() => {
    return () => {
      if (logoPreviewDark) URL.revokeObjectURL(logoPreviewDark);
    };
  }, [logoPreviewDark]);

  async function saveDomain() {
    setDomainError("");
    const trimmed = customDomain.trim().toLowerCase();
    if (!trimmed) {
      setDomainError("Informe o domínio antes de salvar (ex: doar.suaigreja.com.br).");
      return;
    }
    setIsSavingDomain(true);
    try {
      await api.patch("/settings", { branding: { custom_domain: trimmed } } satisfies UpdateSettingsPayload);
      showToast("Domínio salvo. Agora escolha como apontá-lo.");
      loadDomainStatus();
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ??
        "Erro ao salvar o domínio. Tente novamente.";
      setDomainError(message);
    } finally {
      setIsSavingDomain(false);
    }
  }

  async function verifyDomainManually() {
    setDomainError("");
    setIsVerifyingDomain(true);
    try {
      const { data } = await api.post<DomainStatus>("/settings/branding/domain/verify");
      setDomainStatus(data);
      showToast(
        data.status === "verified"
          ? "Domínio verificado!"
          : "Ainda não encontramos o registro — o DNS pode levar algumas horas para propagar.",
      );
    } catch {
      setDomainError("Erro ao verificar o domínio. Confira se o registro foi criado e tente de novo.");
    } finally {
      setIsVerifyingDomain(false);
    }
  }

  async function connectCloudflare() {
    setDomainError("");
    setIsConnectingCloudflare(true);
    try {
      const { data } = await api.get<{ url: string }>("/settings/branding/domain/cloudflare/authorize-url");
      window.location.href = data.url;
    } catch {
      setDomainError("Não foi possível iniciar a conexão com a Cloudflare. Tente novamente.");
      setIsConnectingCloudflare(false);
    }
  }

  async function disconnectCloudflare() {
    setIsConnectingCloudflare(true);
    try {
      const { data } = await api.post<DomainStatus>("/settings/branding/domain/cloudflare/disconnect");
      setDomainStatus(data);
      showToast("Cloudflare desconectada.");
    } catch {
      setDomainError("Erro ao desconectar a Cloudflare. Tente novamente.");
    } finally {
      setIsConnectingCloudflare(false);
    }
  }

  function onLogoSelected(
    e: ChangeEvent<HTMLInputElement>,
    variant: "light" | "dark",
  ) {
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
    if (variant === "dark") {
      if (logoPreviewDark) URL.revokeObjectURL(logoPreviewDark);
      setLogoFileDark(file);
      setLogoPreviewDark(URL.createObjectURL(file));
    } else {
      if (logoPreview) URL.revokeObjectURL(logoPreview);
      setLogoFile(file);
      setLogoPreview(URL.createObjectURL(file));
    }
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
    if (
      primaryColor.trim() &&
      contrastWithWhite(primaryColor.trim()) < AA_CONTRAST
    ) {
      setSaveError(
        "Cor principal clara demais: ela é usada como fundo de botão com texto branco e como cor de texto no PDF da escala. Escolha um tom mais escuro.",
      );
      return;
    }
    if (accentColor.trim() && !HEX_COLOR_RE.test(accentColor.trim())) {
      setSaveError("Cor de destaque deve ser um código hexadecimal válido (ex: #00B8A2).");
      return;
    }

    setIsSaving(true);
    try {
      // `canEditCongregation` é sempre true neste ponto: o botão que chama
      // `handleSave` só existe quando `canEditAny` é true, e
      // `canEditAny = canEditCongregation || canEditTenant` com
      // `canEditCongregation = canEditTenant || admin_congregation` — logo
      // `canEditTenant` true implica `canEditCongregation` true também. Um
      // `if` aqui era branch morto; removido ao fechar a Fase 10
      // (docs/TESTES.md tem o registro).
      const payload: UpdateSettingsPayload = {
        congregation: {
          name: congName.trim(),
          address: congAddress.trim() || undefined,
          timezone: congTimezone,
          email: congEmail.trim() || undefined,
          phone: stripPhone(congPhone) || undefined,
          app_name: appName.trim() || undefined,
          primary_color: primaryColor.trim() || undefined,
          accent_color: accentColor.trim() || undefined,
        },
      };
      if (canEditTenant) {
        payload.tenant = {
          name: tenantName.trim(),
          email: tenantEmail.trim() || undefined,
          phone: stripPhone(tenantPhone) || undefined,
        };
      }

      const { data } = await api.patch<Settings>("/settings", payload);
      applySettings(data);

      // Os dois uploads são independentes: a falha de um não pode impedir
      // a tentativa do outro (cada `try` próprio, não `Promise.all`), e o
      // que já salvou fica salvo — por isso o erro nomeia a variante que
      // falhou, em vez de uma mensagem genérica que deixaria ambíguo o que
      // precisa ser tentado de novo.
      const uploadErrors: string[] = [];

      if (logoFile) {
        try {
          const formData = new FormData();
          formData.append("file", logoFile);
          const { data: logoRes } = await api.post<{ logo_url: string | null }>(
            "/settings/logo?variant=light",
            formData
          );
          setLogoUrl(logoRes.logo_url);
          // `logoPreview` e a ref do `<input type="file">` são sempre setados
          // juntos com `logoFile` em `onLogoSelected`, e o input só desmonta se
          // `canEditCongregation` virar false — o que não acontece enquanto
          // este handler roda (mesmo raciocínio do payload acima). As duas
          // guardas eram branch morto; removidas ao fechar a Fase 10.
          URL.revokeObjectURL(logoPreview as string);
          setLogoFile(null);
          setLogoPreview(null);
          logoInputRef.current!.value = "";
        } catch {
          uploadErrors.push("logotipo claro");
        }
      }

      if (logoFileDark) {
        try {
          const formData = new FormData();
          formData.append("file", logoFileDark);
          const { data: logoRes } = await api.post<{ logo_url_dark: string | null }>(
            "/settings/logo?variant=dark",
            formData
          );
          setLogoUrlDark(logoRes.logo_url_dark);
          URL.revokeObjectURL(logoPreviewDark as string);
          setLogoFileDark(null);
          setLogoPreviewDark(null);
          logoInputRefDark.current!.value = "";
        } catch {
          uploadErrors.push("logotipo escuro");
        }
      }

      if (uploadErrors.length > 0) {
        setSaveError(
          `Configurações salvas, mas o upload do ${uploadErrors.join(" e do ")} falhou. Tente novamente.`
        );
      } else {
        showToast("Configurações salvas com sucesso.");
      }
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
              {/* Preview no tema ativo do navegador agora — é o que confirma
                  que a variante certa está sendo escolhida, sem precisar
                  trocar de tema manualmente para conferir. */}
              <div className="flex items-center gap-4">
                <div
                  className={cn(
                    "flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-[var(--border-default)]",
                    isDarkPreview ? "bg-ink" : "bg-[var(--surface-subtle)]",
                  )}
                >
                  {(() => {
                    const lightSrc = logoPreview ?? logoUrl;
                    const darkSrc = logoPreviewDark ?? logoUrlDark;
                    const effectiveSrc = isDarkPreview ? (darkSrc ?? lightSrc) : lightSrc;
                    return effectiveSrc ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={effectiveSrc}
                        alt="Logotipo"
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <ImageIcon size={22} strokeWidth={1.5} className="text-stone" />
                    );
                  })()}
                </div>
                <div className="flex flex-col gap-0.5">
                  <p className="text-sm text-ink dark:text-white">
                    Prévia no tema {isDarkPreview ? "escuro" : "claro"} do navegador
                  </p>
                  <p className="text-xs text-stone">
                    Sem logo para o modo escuro cadastrado, o claro é usado nos dois.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-subtle)]">
                    {logoPreview || logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={logoPreview ?? (logoUrl as string)}
                        alt="Logotipo (modo claro)"
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <ImageIcon size={18} strokeWidth={1.5} className="text-stone" />
                    )}
                  </div>
                  {canEditCongregation && (
                    <div className="flex flex-col gap-1.5">
                      <input
                        ref={logoInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/svg+xml"
                        onChange={(e) => onLogoSelected(e, "light")}
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
                        Logotipo (modo claro)
                      </Button>
                      <p className="text-xs text-stone">JPG, PNG, WEBP ou SVG · máx. 5MB</p>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-[8px] border border-[var(--border-default)] bg-ink">
                    {logoPreviewDark || logoUrlDark ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={logoPreviewDark ?? (logoUrlDark as string)}
                        alt="Logotipo (modo escuro)"
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <ImageIcon size={18} strokeWidth={1.5} className="text-white/60" />
                    )}
                  </div>
                  {canEditCongregation && (
                    <div className="flex flex-col gap-1.5">
                      <input
                        ref={logoInputRefDark}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/svg+xml"
                        onChange={(e) => onLogoSelected(e, "dark")}
                        disabled={isSaving}
                        className="hidden"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="rounded-[8px]"
                        onClick={() => logoInputRefDark.current?.click()}
                        disabled={isSaving}
                      >
                        Logotipo (modo escuro)
                      </Button>
                      <p className="text-xs text-stone">
                        Opcional · JPG, PNG, WEBP ou SVG · máx. 5MB
                      </p>
                    </div>
                  )}
                </div>
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
                      aria-label="Selecionar cor principal"
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
                  <p className="mt-1 text-xs text-stone">
                    Botões e destaques. Precisa ser escura o bastante para texto branco
                    em cima.
                  </p>
                </Field>
                <Field label="Cor de destaque">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      aria-label="Selecionar cor de destaque"
                      value={HEX_COLOR_RE.test(accentColor) ? accentColor : "#00b8a2"}
                      onChange={(e) => setAccentColor(e.target.value)}
                      disabled={!canEditCongregation || isSaving}
                      className="h-8 w-10 cursor-pointer rounded-[6px] border border-[var(--border-default)] bg-transparent disabled:cursor-not-allowed disabled:opacity-50"
                    />
                    <Input
                      value={accentColor}
                      onChange={(e) => setAccentColor(e.target.value)}
                      placeholder="#00B8A2"
                      disabled={!canEditCongregation || isSaving}
                      className="rounded-[8px]"
                    />
                  </div>
                  <p className="mt-1 text-xs text-stone">
                    Ícone ativo e indicadores no app. Sem contraste suficiente, o app
                    usa a cor principal no lugar.
                  </p>
                </Field>
              </div>
            </div>
          </section>

          {/* ── Domínio próprio (Premium) ── */}
          {canEditTenant && !domainAvailable && domainError && (
            <p className="rounded-[8px] bg-crimson-dim px-3 py-2 text-sm text-crimson">{domainError}</p>
          )}
          {canEditTenant && domainAvailable && (
            <section className="rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-card)] p-5">
              <div className="mb-4 flex items-center gap-2">
                <Globe size={16} strokeWidth={1.5} className="text-navy" />
                <h2 className="text-sm font-medium text-ink dark:text-white">Domínio próprio</h2>
              </div>

              <div className="flex flex-col gap-4">
                <Field label="Domínio" full>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      value={customDomain}
                      onChange={(e) => setCustomDomain(e.target.value)}
                      placeholder="doar.suaigreja.com.br"
                      disabled={isSavingDomain}
                      className="rounded-[8px]"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="shrink-0 rounded-[8px]"
                      onClick={saveDomain}
                      disabled={isSavingDomain || customDomain.trim() === (domainStatus?.custom_domain ?? "")}
                    >
                      {isSavingDomain && <Loader2 size={14} className="mr-1.5 animate-spin" />}
                      Salvar
                    </Button>
                  </div>
                  <p className="mt-1 text-xs text-stone">
                    Sem protocolo — só o hostname (ex: doar.suaigreja.com.br, não https://…).
                  </p>
                </Field>

                {domainStatus?.custom_domain && (
                  <div className="flex flex-col gap-3 rounded-[10px] border border-[var(--border-default)] bg-[var(--surface-subtle)] p-4">
                    <div className="flex items-center gap-2 text-sm">
                      {domainStatus.status === "verified" ? (
                        <>
                          <CheckCircle2 size={15} className="text-teal" />
                          <span className="text-ink dark:text-white">
                            {domainStatus.custom_domain} está apontado e verificado.
                          </span>
                        </>
                      ) : (
                        <span className="text-stone">
                          Aguardando o DNS apontar para {domainStatus.custom_domain}.
                        </span>
                      )}
                    </div>

                    {domainStatus.status !== "verified" && (
                      <>
                        {domainStatus.cloudflare_connected ? (
                          <p className="text-xs text-stone">
                            Cloudflare conectada — o registro é criado automaticamente. Se o
                            domínio acabou de ser salvo, aguarde alguns minutos e verifique.
                          </p>
                        ) : (
                          domainStatus.manual_instructions && (
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-left text-stone">
                                    <th className="pb-1.5 pr-4 font-medium">Tipo</th>
                                    <th className="pb-1.5 pr-4 font-medium">Nome</th>
                                    <th className="pb-1.5 font-medium">Valor</th>
                                  </tr>
                                </thead>
                                <tbody className="font-mono text-ink dark:text-white">
                                  <tr>
                                    <td className="py-1 pr-4">CNAME</td>
                                    <td className="py-1 pr-4">{domainStatus.manual_instructions.cname.name}</td>
                                    <td className="py-1">{domainStatus.manual_instructions.cname.value}</td>
                                  </tr>
                                  <tr>
                                    <td className="py-1 pr-4">A (domínio raiz)</td>
                                    <td className="py-1 pr-4">{domainStatus.manual_instructions.apex_alternative.name}</td>
                                    <td className="py-1">{domainStatus.manual_instructions.apex_alternative.value}</td>
                                  </tr>
                                </tbody>
                              </table>
                              <p className="mt-2 text-xs text-stone">{domainStatus.manual_instructions.note}</p>
                            </div>
                          )
                        )}

                        <div className="flex flex-wrap gap-2 pt-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="rounded-[8px]"
                            onClick={verifyDomainManually}
                            disabled={isVerifyingDomain}
                          >
                            {isVerifyingDomain && <Loader2 size={13} className="mr-1.5 animate-spin" />}
                            Verificar domínio
                          </Button>
                          {domainStatus.cloudflare_connected ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="rounded-[8px]"
                              onClick={disconnectCloudflare}
                              disabled={isConnectingCloudflare}
                            >
                              Desconectar Cloudflare
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              className="gap-1.5 rounded-[8px] bg-[#F6821F] text-white hover:bg-[#dd7519]"
                              onClick={connectCloudflare}
                              disabled={isConnectingCloudflare}
                            >
                              {isConnectingCloudflare ? (
                                <Loader2 size={13} className="animate-spin" />
                              ) : (
                                <CloudCog size={13} />
                              )}
                              Conectar com Cloudflare
                            </Button>
                          )}
                        </div>
                        <p className="text-xs text-stone">
                          Conectar com a Cloudflare cria o registro automaticamente — sem
                          precisar copiar nada. Você será levado à própria Cloudflare para
                          autorizar o acesso.
                        </p>
                      </>
                    )}
                  </div>
                )}

                {domainError && <p className="text-sm text-crimson">{domainError}</p>}
              </div>
            </section>
          )}

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

export default function ConfiguracoesPage() {
  return (
    <Suspense fallback={<Skeleton className="h-44 w-full rounded-[12px]" />}>
      <ConfiguracoesContent />
    </Suspense>
  );
}
