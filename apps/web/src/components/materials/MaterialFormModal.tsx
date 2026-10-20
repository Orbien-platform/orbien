"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";
import { MATERIAL_FILE_ACCEPT, validateMaterialFile } from "@/lib/upload-meeting-material";
import { uploadStudyMaterial } from "@/lib/upload-study-material";

type Audience = "all_networks" | "network" | "group";
type Visibility = "all" | "leaders_only";
type Kind = "file" | "text";

interface NetworkOption {
  id: string;
  name: string;
}
interface GroupOption {
  id: string;
  name: string;
}

/** Material já criado, como `GET /study-materials/:id` o devolve. */
export interface EditableMaterial {
  id: string;
  title: string;
  audience: Audience;
  network_id?: string | null;
  visibility: Visibility;
  publish_at: string;
  materialTargets: { small_group_id: string }[];
}

interface MaterialFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  /** Presente = edita o alcance e a liberação; o conteúdo não muda por aqui. */
  material?: EditableMaterial | null;
}

/** ISO → valor de `datetime-local` no fuso do navegador. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Criação de material com alcance: todas as redes, uma rede ou um PG. O pai
// (`MateriaisPage`) troca a `key` a cada abertura, remontando o formulário com
// estado limpo — mesmo padrão de `NetworkFormModal`. Com `material`, o mesmo
// formulário edita título, alcance, visibilidade e liberação (o arquivo ou o
// texto ficam como estão).
export function MaterialFormModal({ open, onOpenChange, onSaved, material }: MaterialFormModalProps) {
  const editing = !!material;
  const [title, setTitle] = useState(material?.title ?? "");
  const [kind, setKind] = useState<Kind>("file");
  const [file, setFile] = useState<File | null>(null);
  const [content, setContent] = useState("");
  const [audience, setAudience] = useState<Audience>(material?.audience ?? "all_networks");
  const [networkId, setNetworkId] = useState(material?.network_id ?? "");
  const [groupId, setGroupId] = useState(material?.materialTargets[0]?.small_group_id ?? "");
  const [visibility, setVisibility] = useState<Visibility>(material?.visibility ?? "all");
  const [releaseAt, setReleaseAt] = useState(material ? toLocalInput(material.publish_at) : "");
  const [networks, setNetworks] = useState<NetworkOption[]>([]);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  // Cada lista falha sozinha: /networks é Premium e responde 403 em outros
  // planos, e isso não pode apagar o seletor de PG (nem o inverso).
  const [networksError, setNetworksError] = useState(false);
  const [groupsError, setGroupsError] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const signal = { cancelled: false };
    Promise.allSettled([
      api.get<NetworkOption[]>("/networks"),
      api.get<{ data: GroupOption[] }>("/small-groups?limit=100"),
    ]).then(([n, g]) => {
      if (signal.cancelled) return;
      if (n.status === "fulfilled") setNetworks(n.value.data);
      else setNetworksError(true);
      if (g.status === "fulfilled") setGroups(g.value.data.data ?? []);
      else setGroupsError(true);
    });
    return () => {
      signal.cancelled = true;
    };
  }, [open]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (!title.trim()) return setError("Informe o título do material.");
    if (!editing && kind === "file" && !file) return setError("Escolha o arquivo PDF ou Word.");
    if (!editing && kind === "text" && !content.trim()) return setError("Escreva o texto ou cole o link.");
    if (audience === "network" && !networkId) return setError("Escolha a rede.");
    if (audience === "group" && !groupId) return setError("Escolha o PG.");

    const fields = {
      title: title.trim(),
      audience,
      ...(audience === "network" ? { network_id: networkId } : {}),
      ...(audience === "group" ? { target_group_ids: [groupId] } : {}),
      visibility,
      publish_at: releaseAt
        ? new Date(releaseAt).toISOString()
        : (material?.publish_at ?? new Date().toISOString()),
    };

    setIsSubmitting(true);
    setProgress(0);
    try {
      if (material) {
        await api.patch(`/study-materials/${material.id}`, fields);
      } else if (kind === "file") {
        await uploadStudyMaterial(file!, fields, setProgress);
      } else {
        await api.post("/study-materials", {
          ...fields,
          source_type: "rich_text",
          rich_content: content.trim(),
        });
      }
      onSaved();
      onOpenChange(false);
    } catch (err: unknown) {
      const message = (err as Error)?.message ?? "";
      setError(
        message.endsWith("_413")
          ? "Arquivo muito grande. Máximo: 50MB"
          : message.endsWith("_400")
            ? "Confira o arquivo (PDF ou Word) e o alcance escolhido."
            : "Erro ao salvar o material. Tente de novo."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? "Editar material" : "Novo material"}
      description={
        editing
          ? "Mude quem recebe o material, quem pode vê-lo e quando é liberado."
          : "Escolha o conteúdo e quem vai recebê-lo."
      }
      className="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="material-title">Título</Label>
          <Input
            id="material-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={isSubmitting}
            className="rounded-[8px]"
          />
        </div>

        {!editing && (
        <fieldset className="flex flex-col gap-1.5" disabled={isSubmitting}>
          <legend className="mb-1 text-sm font-medium text-ink dark:text-white">Conteúdo</legend>
          <label className="flex items-center gap-2 text-sm text-ink dark:text-white">
            <input type="radio" name="material-kind" checked={kind === "file"} onChange={() => setKind("file")} />
            Arquivo PDF ou Word
          </label>
          <label className="flex items-center gap-2 text-sm text-ink dark:text-white">
            <input type="radio" name="material-kind" checked={kind === "text"} onChange={() => setKind("text")} />
            Texto ou link
          </label>
        </fieldset>
        )}

        {!editing && (kind === "file" ? (
          <input
            type="file"
            accept={MATERIAL_FILE_ACCEPT}
            aria-label="Arquivo do material"
            disabled={isSubmitting}
            onChange={(e) => {
              const picked = e.target.files?.[0] ?? null;
              const invalid = picked ? validateMaterialFile(picked) : null;
              setError(invalid ?? "");
              setFile(invalid ? null : picked);
              if (invalid) e.target.value = "";
            }}
            className="text-sm text-stone file:mr-3 file:rounded-[8px] file:border file:border-[var(--border-default)] file:bg-[var(--surface-subtle)] file:px-3 file:py-1.5 file:text-sm file:text-ink"
          />
        ) : (
          <textarea
            aria-label="Texto ou link do material"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={isSubmitting}
            rows={5}
            className="w-full rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] px-3 py-2 text-sm text-ink dark:text-white"
          />
        ))}

        <fieldset className="flex flex-col gap-1.5" disabled={isSubmitting}>
          <legend className="mb-1 text-sm font-medium text-ink dark:text-white">Para quem</legend>
          <label className="flex items-center gap-2 text-sm text-ink dark:text-white">
            <input type="radio" name="material-audience" checked={audience === "all_networks"} onChange={() => setAudience("all_networks")} />
            Todas as redes
          </label>
          <label className="flex items-center gap-2 text-sm text-ink dark:text-white">
            <input type="radio" name="material-audience" checked={audience === "network"} disabled={networksError} onChange={() => setAudience("network")} />
            Uma rede
          </label>
          {audience === "network" && (
            <select
              aria-label="Rede"
              value={networkId}
              onChange={(e) => setNetworkId(e.target.value)}
              className="rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] px-3 py-2 text-sm text-ink dark:text-white"
            >
              <option value="">Selecione a rede</option>
              {networks.map((n) => (
                <option key={n.id} value={n.id}>{n.name}</option>
              ))}
            </select>
          )}
          <label className="flex items-center gap-2 text-sm text-ink dark:text-white">
            <input type="radio" name="material-audience" checked={audience === "group"} disabled={groupsError} onChange={() => setAudience("group")} />
            Um PG
          </label>
          {audience === "group" && (
            <select
              aria-label="PG"
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              className="rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] px-3 py-2 text-sm text-ink dark:text-white"
            >
              <option value="">Selecione o PG</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          )}
          {networksError && (
            <p className="text-xs text-crimson">Não foi possível carregar as redes.</p>
          )}
          {groupsError && (
            <p className="text-xs text-crimson">Não foi possível carregar os PGs.</p>
          )}
        </fieldset>

        <fieldset className="flex flex-col gap-1.5" disabled={isSubmitting}>
          <legend className="mb-1 text-sm font-medium text-ink dark:text-white">Quem pode ver</legend>
          <label className="flex items-center gap-2 text-sm text-ink dark:text-white">
            <input type="radio" name="material-visibility" checked={visibility === "all"} onChange={() => setVisibility("all")} />
            Todos os participantes
          </label>
          <label className="flex items-center gap-2 text-sm text-ink dark:text-white">
            <input type="radio" name="material-visibility" checked={visibility === "leaders_only"} onChange={() => setVisibility("leaders_only")} />
            Somente líderes
          </label>
        </fieldset>

        <label className="flex flex-col gap-1 text-sm text-ink dark:text-white">
          Liberar em
          <Input
            type="datetime-local"
            value={releaseAt}
            onChange={(e) => setReleaseAt(e.target.value)}
            disabled={isSubmitting}
            className="rounded-[8px]"
          />
          <span className="text-xs text-stone">
            {editing
              ? "Quem já foi avisado não recebe um novo aviso ao mudar o alcance."
              : "Deixe em branco para liberar agora. Os participantes são avisados na data."}
          </span>
        </label>

        {isSubmitting && kind === "file" && (
          <div
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-subtle)]"
          >
            <div className="h-full bg-teal transition-[width]" style={{ width: `${progress}%` }} />
          </div>
        )}

        {error && (
          <p className="rounded-[8px] bg-crimson-dim px-3 py-2 text-sm text-crimson" role="alert">
            {error}
          </p>
        )}

        <Button
          type="submit"
          disabled={isSubmitting}
          className="rounded-[8px] bg-navy text-white hover:bg-[var(--color-navy-dark)]"
        >
          {isSubmitting ? (
            <Loader2 size={14} className="animate-spin" />
          ) : editing ? (
            "Salvar alterações"
          ) : (
            "Publicar material"
          )}
        </Button>
      </form>
    </Modal>
  );
}
