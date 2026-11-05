"use client";

/**
 * QR de autocadastro de visitante (PEND-19).
 *
 * Cria QR de culto, grupo ou evento, renomeia, liga e desliga — o que o app
 * só faz para o QR do culto. O QR aponta para `/visitante/{slug}/{token}`
 * (PROD-34), o mesmo formato que `signupUrl` monta no app. Quem decide a
 * igreja é o token; o slug só viaja no caminho.
 *
 * Rotas: `admin/visitor/qr` (listar, criar, `PATCH :id`). A API exige
 * tenant_admin, admin_congregation, pastor ou secretary — papel sem isso cai
 * no estado de "sem acesso", sem tratar 403 como lista vazia.
 */
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  Check,
  Copy,
  Loader2,
  Pencil,
  Plus,
  Power,
  QrCode,
} from "lucide-react";
import { QrImage } from "@/components/people/QrImage";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/Modal";
import { NoAccessState } from "@/components/ui/NoAccessState";
import api, { isForbidden } from "@/lib/api";
import { apiErrorMessage } from "@/lib/api-error";

type Origin = "service" | "small_group" | "event" | "other";

interface QrRow {
  id: string;
  token: string;
  origin: Origin;
  small_group_id: string | null;
  label: string | null;
  is_active: boolean;
  scan_count: number;
}

interface GroupOption {
  id: string;
  name: string;
}

const ORIGIN_LABELS: Record<Origin, string> = {
  service: "Culto",
  small_group: "Grupo",
  event: "Evento",
  other: "Outro",
};

const ORIGINS = Object.keys(ORIGIN_LABELS) as Origin[];

function signupUrl(origin: string, slug: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}/visitante/${encodeURIComponent(slug)}/${encodeURIComponent(token)}`;
}

function rowName(row: QrRow, groups: GroupOption[]): string {
  if (row.label?.trim()) return row.label.trim();
  const group = groups.find((g) => g.id === row.small_group_id);
  return group ? group.name : ORIGIN_LABELS[row.origin];
}

export default function QrVisitantesPage() {
  const [rows, setRows] = useState<QrRow[]>([]);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [slug, setSlug] = useState<string | null>(null);
  // Qual `reload` já terminou de carregar: derivado, sem setState no efeito.
  const [loadedReload, setLoadedReload] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [denied, setDenied] = useState(false);
  const [reload, setReload] = useState(0);
  const [actionError, setActionError] = useState("");
  const [creating, setCreating] = useState(false);
  const [showing, setShowing] = useState<QrRow | null>(null);
  const [renaming, setRenaming] = useState<QrRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<QrRow[]>("/admin/visitor/qr")
      .then(({ data }) => {
        if (cancelled) return;
        setRows(Array.isArray(data) ? data : []);
        setFailed(false);
        setDenied(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setRows([]);
        setDenied(isForbidden(err));
        setFailed(!isForbidden(err));
      })
      .finally(() => {
        if (!cancelled) setLoadedReload(reload);
      });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  // Slug (para montar o endereço) e nomes dos grupos: se falharem, a tela
  // segue — o QR só não consegue ser mostrado sem o slug, e o botão avisa.
  useEffect(() => {
    api
      .get<{ tenant: { slug: string } }>("/settings")
      .then(({ data }) => setSlug(data.tenant.slug))
      .catch(() => setSlug(null));
    api
      .get<{ data: GroupOption[] }>("/small-groups", { params: { limit: 100 } })
      .then(({ data }) => setGroups(Array.isArray(data?.data) ? data.data : []))
      .catch(() => setGroups([]));
  }, []);

  const loading = loadedReload !== reload;

  const refresh = useCallback(() => setReload((n) => n + 1), []);

  async function setActive(row: QrRow, isActive: boolean) {
    setActionError("");
    setBusyId(row.id);
    try {
      await api.patch(`/admin/visitor/qr/${row.id}`, { is_active: isActive });
      refresh();
    } catch (err: unknown) {
      setActionError(
        apiErrorMessage(err, "Não foi possível alterar o QR. Tente de novo."),
      );
    } finally {
      setBusyId(null);
    }
  }

  if (denied) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="page-title">QR de visitantes</h1>
        <NoAccessState resource="QR de visitantes" />
      </div>
    );
  }

  const columns: Column<QrRow>[] = [
    {
      key: "name",
      header: "QR",
      render: (r) => (
        <div className="flex flex-col">
          <span className="font-medium text-ink dark:text-white">
            {rowName(r, groups)}
          </span>
          <span className="text-xs text-stone">{ORIGIN_LABELS[r.origin]}</span>
        </div>
      ),
    },
    {
      key: "scans",
      header: "Cadastros",
      render: (r) => <span className="font-mono">{r.scan_count}</span>,
    },
    {
      key: "status",
      header: "Situação",
      render: (r) => (
        <span
          className={
            r.is_active
              ? "inline-flex rounded-[100px] bg-teal-dim px-2 py-0.5 text-xs font-medium text-teal-ink"
              : "inline-flex rounded-[100px] bg-[var(--surface-subtle)] px-2 py-0.5 text-xs font-medium text-stone"
          }
        >
          {r.is_active ? "Ativo" : "Desativado"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (r) => (
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={() => setShowing(r)}
            disabled={!slug}
            title={
              slug ? undefined : "Não foi possível ler o endereço da igreja"
            }
            className="inline-flex h-8 items-center gap-1.5 rounded-[8px] px-2.5 text-sm text-navy hover:bg-[var(--surface-subtle)] disabled:opacity-50 dark:text-white"
          >
            <QrCode size={14} aria-hidden="true" />
            Mostrar QR
          </button>
          <button
            type="button"
            onClick={() => setRenaming(r)}
            aria-label={`Renomear ${rowName(r, groups)}`}
            className="flex size-8 items-center justify-center rounded-[8px] text-stone hover:bg-[var(--surface-subtle)] hover:text-ink"
          >
            <Pencil size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setActive(r, !r.is_active)}
            disabled={busyId === r.id}
            aria-label={`${r.is_active ? "Desativar" : "Reativar"} ${rowName(r, groups)}`}
            className="flex size-8 items-center justify-center rounded-[8px] text-stone hover:bg-[var(--surface-subtle)] hover:text-ink disabled:opacity-50"
          >
            <Power size={14} aria-hidden="true" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="page-title">QR de visitantes</h1>
          <p className="max-w-xl text-sm text-stone">
            Quem lê o QR com a câmera do celular cai no cadastro da igreja, sem
            instalar nada. Crie um para o culto, outro para cada grupo ou evento
            e desative o que não vale mais.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => setCreating(true)}
          className="h-10 rounded-[8px] bg-navy font-sans text-sm font-medium text-white hover:bg-[var(--color-navy-dark)]"
        >
          <Plus size={16} />
          Novo QR
        </Button>
      </div>

      {actionError && (
        <div className="rounded-[8px] bg-crimson-dim px-3 py-2" role="alert">
          <p className="text-sm text-crimson">{actionError}</p>
        </div>
      )}

      <DataTable
        columns={columns}
        rows={rows}
        getRowKey={(r) => r.id}
        isLoading={loading}
        skeletonRows={3}
        error={failed ? "Não foi possível carregar os QR." : undefined}
        onRetry={refresh}
        emptyState={
          <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
            <QrCode
              size={28}
              strokeWidth={1.5}
              className="text-stone"
              aria-hidden="true"
            />
            <p className="text-sm font-medium text-ink dark:text-white">
              Nenhum QR criado ainda
            </p>
            <p className="max-w-sm text-sm text-stone">
              Crie o QR do culto para projetar no telão e receber os visitantes
              de domingo.
            </p>
          </div>
        }
      />

      <CreateQrModal
        open={creating}
        groups={groups}
        onOpenChange={setCreating}
        onCreated={() => {
          setCreating(false);
          refresh();
        }}
      />

      <RenameQrModal
        row={renaming}
        onClose={() => setRenaming(null)}
        onSaved={() => {
          setRenaming(null);
          refresh();
        }}
      />

      <ShowQrModal
        row={showing}
        name={showing ? rowName(showing, groups) : ""}
        slug={slug}
        onClose={() => setShowing(null)}
      />
    </div>
  );
}

// ─── Criar ───────────────────────────────────────────────────────────────────

function CreateQrModal({
  open,
  groups,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  groups: GroupOption[];
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  // O formulário é um componente à parte: o Modal desmonta o conteúdo ao
  // fechar, e é isso que zera os campos — sem efeito para "resetar".
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Novo QR de visitantes"
    >
      <CreateQrForm groups={groups} onCreated={onCreated} />
    </Modal>
  );
}

function CreateQrForm({
  groups,
  onCreated,
}: {
  groups: GroupOption[];
  onCreated: () => void;
}) {
  const [origin, setOrigin] = useState<Origin>("service");
  const [groupId, setGroupId] = useState("");
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const needsGroup = origin === "small_group";
  const canSave = !saving && (!needsGroup || groupId !== "");

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError("");
    try {
      await api.post("/admin/visitor/qr", {
        origin,
        ...(needsGroup ? { small_group_id: groupId } : {}),
        ...(label.trim() ? { label: label.trim() } : {}),
      });
      onCreated();
    } catch (err: unknown) {
      setError(
        apiErrorMessage(err, "Não foi possível criar o QR. Tente de novo."),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label
          htmlFor="qr-origin"
          className="text-sm font-medium text-ink dark:text-white"
        >
          Onde ele vai ficar
        </Label>
        <select
          id="qr-origin"
          value={origin}
          onChange={(e) => setOrigin(e.target.value as Origin)}
          className="h-9 rounded-[8px] border border-[var(--border-default)] bg-transparent px-2.5 text-sm text-ink dark:text-white"
        >
          {ORIGINS.map((o) => (
            <option key={o} value={o}>
              {ORIGIN_LABELS[o]}
            </option>
          ))}
        </select>
      </div>

      {needsGroup && (
        <div className="flex flex-col gap-1.5">
          <Label
            htmlFor="qr-group"
            className="text-sm font-medium text-ink dark:text-white"
          >
            Grupo
          </Label>
          <select
            id="qr-group"
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            className="h-9 rounded-[8px] border border-[var(--border-default)] bg-transparent px-2.5 text-sm text-ink dark:text-white"
          >
            <option value="">Escolha o grupo</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label
          htmlFor="qr-label"
          className="text-sm font-medium text-ink dark:text-white"
        >
          Nome (opcional)
        </Label>
        <Input
          id="qr-label"
          value={label}
          maxLength={80}
          placeholder="Culto de domingo à noite"
          onChange={(e) => setLabel(e.target.value)}
          className="rounded-[8px]"
        />
        <p className="text-xs text-stone">
          O visitante vê este nome no topo do cadastro.
        </p>
      </div>

      {error && (
        <div className="rounded-[8px] bg-crimson-dim px-3 py-2" role="alert">
          <p className="text-sm text-crimson">{error}</p>
        </div>
      )}

      <Button
        type="submit"
        disabled={!canSave}
        className="h-10 w-full rounded-[8px] bg-navy font-sans text-sm font-medium text-white hover:bg-[var(--color-navy-dark)] disabled:opacity-60"
      >
        {saving ? (
          <>
            <Loader2
              size={16}
              className="mr-2 animate-spin motion-reduce:animate-none"
            />
            Criando…
          </>
        ) : (
          "Criar QR"
        )}
      </Button>
    </form>
  );
}

// ─── Renomear ────────────────────────────────────────────────────────────────

function RenameQrModal({
  row,
  onClose,
  onSaved,
}: {
  row: QrRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <Modal
      open={row !== null}
      onOpenChange={(o) => !o && onClose()}
      title="Renomear QR"
    >
      {row && <RenameQrForm row={row} onSaved={onSaved} />}
    </Modal>
  );
}

function RenameQrForm({ row, onSaved }: { row: QrRow; onSaved: () => void }) {
  const [label, setLabel] = useState(row.label ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      await api.patch(`/admin/visitor/qr/${row.id}`, { label: label.trim() });
      onSaved();
    } catch (err: unknown) {
      setError(
        apiErrorMessage(err, "Não foi possível renomear. Tente de novo."),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label
          htmlFor="qr-rename"
          className="text-sm font-medium text-ink dark:text-white"
        >
          Nome
        </Label>
        <Input
          id="qr-rename"
          value={label}
          maxLength={80}
          onChange={(e) => setLabel(e.target.value)}
          className="rounded-[8px]"
        />
        <p className="text-xs text-stone">
          O QR impresso continua valendo: só o nome muda, o endereço é o mesmo.
        </p>
      </div>
      {error && (
        <div className="rounded-[8px] bg-crimson-dim px-3 py-2" role="alert">
          <p className="text-sm text-crimson">{error}</p>
        </div>
      )}
      <Button
        type="submit"
        disabled={saving}
        className="h-10 w-full rounded-[8px] bg-navy font-sans text-sm font-medium text-white hover:bg-[var(--color-navy-dark)] disabled:opacity-60"
      >
        {saving ? "Salvando…" : "Salvar nome"}
      </Button>
    </form>
  );
}

// ─── Mostrar ─────────────────────────────────────────────────────────────────

function ShowQrModal({
  row,
  name,
  slug,
  onClose,
}: {
  row: QrRow | null;
  name: string;
  slug: string | null;
  onClose: () => void;
}) {
  const url =
    row && slug ? signupUrl(window.location.origin, slug, row.token) : "";

  return (
    <Modal
      open={row !== null && url !== ""}
      onOpenChange={(o) => !o && onClose()}
      title={name}
      description={
        row && !row.is_active
          ? "Este QR está desativado e não recebe cadastros."
          : undefined
      }
    >
      <ShowQrBody url={url} name={name} />
    </Modal>
  );
}

function ShowQrBody({ url, name }: { url: string; name: string }) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  async function copy() {
    setCopyFailed(false);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopyFailed(true);
    }
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <QrImage value={url} label={`QR de cadastro: ${name}`} />
      <p className="w-full break-all rounded-[8px] bg-[var(--surface-subtle)] px-3 py-2 font-mono text-xs text-stone">
        {url}
      </p>
      <Button
        type="button"
        variant="outline"
        onClick={copy}
        className="h-10 w-full rounded-[8px]"
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
        {copied ? "Endereço copiado" : "Copiar endereço"}
      </Button>
      {copyFailed && (
        <p className="text-sm text-crimson" role="alert">
          Não foi possível copiar. Selecione o endereço acima e copie à mão.
        </p>
      )}
    </div>
  );
}
