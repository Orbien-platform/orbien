"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { Check, Loader2, MapPin, Navigation, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/Modal";
import { SearchInput } from "@/components/ui/SearchInput";
import api from "@/lib/api";
import { apiErrorMessage } from "@/lib/api-error";
import axios from "axios";

// `ssr: false` porque o mapa carrega o Leaflet, que toca `document`. O
// componente já adia o `import()` para dentro do efeito; isto evita também o
// custo de mandá-lo no HTML do servidor, que não teria o que renderizar.
const PublicCellsMap = dynamic(
  () => import("@/components/groups/PublicCellsMap").then((m) => m.PublicCellsMap),
  { ssr: false, loading: () => <div className="h-full w-full bg-[var(--surface-subtle)]" /> },
);

interface PublicCell {
  id: string;
  name: string;
  description: string | null;
  photo_url: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  meeting_time: string | null;
  recurrence: string | null;
  group_type: { id: string; name: string; color: string | null };
  congregation: { id: string; name: string };
}

interface PublicCellsResponse {
  church_name: string;
  groups: PublicCell[];
}

const RECURRENCE_LABEL: Record<string, string> = {
  weekly: "Toda semana",
  biweekly: "A cada 15 dias",
  monthly: "Uma vez por mês",
};

export function recurrenceLabel(recurrence: string | null): string | null {
  if (!recurrence) return null;
  return RECURRENCE_LABEL[recurrence] ?? recurrence;
}

/**
 * Distância em km pela fórmula de haversine.
 *
 * É aproximação de linha reta, não de rota — serve para ordenar "qual está
 * mais perto", que é o que a tela promete, e não para dizer quanto se anda até
 * lá. O trajeto real fica com o mapa externo do botão "Como chegar".
 */
export function distanceKm(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): number {
  const EARTH_RADIUS_KM = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1).replace(".", ",")} km`;
}

export default function EncontreUmaCelulaPage() {
  const params = useParams<{ tenant_slug: string }>();
  const tenantSlug = params.tenant_slug;

  const [churchName, setChurchName] = useState("");
  const [cells, setCells] = useState<PublicCell[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [search, setSearch] = useState("");
  const [typeId, setTypeId] = useState("");
  const [congregationId, setCongregationId] = useState("");
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState("");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [visitTarget, setVisitTarget] = useState<PublicCell | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      try {
        const { data } = await api.get<PublicCellsResponse>("/public/small-groups", {
          params: { tenant_slug: tenantSlug },
        });
        if (cancelled) return;
        setChurchName(data.church_name);
        setCells(data.groups);
      } catch (err: unknown) {
        if (cancelled) return;
        const fallback = "Não foi possível carregar as células agora. Tente novamente.";
        if (axios.isAxiosError(err) && err.response?.status === 404) {
          setLoadError("Igreja não encontrada. Confira o link recebido.");
        } else {
          setLoadError(apiErrorMessage(err, fallback));
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [tenantSlug]);

  const types = useMemo(() => {
    const byId = new Map<string, { id: string; name: string }>();
    for (const cell of cells) byId.set(cell.group_type.id, cell.group_type);
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [cells]);

  const congregations = useMemo(() => {
    const byId = new Map<string, { id: string; name: string }>();
    for (const cell of cells) byId.set(cell.congregation.id, cell.congregation);
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [cells]);

  // Os filtros rodam aqui, e não na API: a rota pública devolve as células
  // públicas da igreja de uma vez só (ver o comentário de MAX_PUBLIC_GROUPS no
  // serviço), então filtrar no cliente é instantâneo e não vira superfície
  // pública nova a cada filtro que a tela ganhar.
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();

    const filtered = cells.filter((cell) => {
      if (typeId && cell.group_type.id !== typeId) return false;
      if (congregationId && cell.congregation.id !== congregationId) return false;
      if (!term) return true;
      return [cell.name, cell.address, cell.description, cell.congregation.name]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(term));
    });

    if (!position) return filtered;

    // Célula sem coordenada (ou com só uma das duas, que o banco permite) vai
    // para o fim da lista em vez de sumir: ela continua tendo nome, horário e
    // um endereço escrito à mão para quem estiver procurando.
    const distanceFrom = (cell: PublicCell) =>
      cell.lat === null || cell.lng === null
        ? Number.POSITIVE_INFINITY
        : distanceKm(position, { lat: cell.lat, lng: cell.lng });

    return [...filtered].sort((a, b) => distanceFrom(a) - distanceFrom(b));
  }, [cells, search, typeId, congregationId, position]);

  const points = useMemo(
    () =>
      visible
        .filter((cell) => cell.lat !== null && cell.lng !== null)
        .map((cell) => ({ id: cell.id, name: cell.name, lat: cell.lat!, lng: cell.lng! })),
    [visible],
  );

  function handleLocate() {
    setLocationError("");
    if (!navigator.geolocation) {
      setLocationError("Seu navegador não informa localização.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => {
        setLocationError("Não conseguimos sua localização. Você pode buscar pelo bairro.");
        setLocating(false);
      },
    );
  }

  return (
    <div className="min-h-screen bg-[var(--surface-parchment)]">
      <div className="mx-auto w-full max-w-5xl px-4 py-10">
        <header className="mb-6">
          <h1 className="font-sans text-2xl font-medium text-navy">Encontre uma célula</h1>
          <p className="mt-1 text-sm font-light text-stone">
            {churchName ? `Células abertas da ${churchName}` : "Células abertas perto de você"}
          </p>
        </header>

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-stone">
            <Loader2 size={16} className="animate-spin" />
            Carregando células…
          </div>
        ) : loadError ? (
          <div className="rounded-[8px] bg-crimson-dim px-3 py-2" role="alert">
            <p className="text-sm text-crimson">{loadError}</p>
          </div>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <SearchInput
                placeholder="Bairro, endereço ou nome da célula"
                onSearch={setSearch}
                className="min-w-[220px] flex-1"
              />

              {types.length > 1 && (
                <select
                  aria-label="Tipo de célula"
                  value={typeId}
                  onChange={(e) => setTypeId(e.target.value)}
                  className="h-8 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] px-2 text-sm text-ink dark:text-white"
                >
                  <option value="">Todos os tipos</option>
                  {types.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </select>
              )}

              {congregations.length > 1 && (
                <select
                  aria-label="Congregação"
                  value={congregationId}
                  onChange={(e) => setCongregationId(e.target.value)}
                  className="h-8 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] px-2 text-sm text-ink dark:text-white"
                >
                  <option value="">Todas as congregações</option>
                  {congregations.map((congregation) => (
                    <option key={congregation.id} value={congregation.id}>
                      {congregation.name}
                    </option>
                  ))}
                </select>
              )}

              <button
                type="button"
                onClick={handleLocate}
                disabled={locating}
                className="flex h-8 items-center gap-1.5 rounded-[8px] border border-[var(--border-default)] px-3 text-sm text-ink disabled:opacity-60 dark:text-white"
              >
                {locating ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Navigation size={14} strokeWidth={1.5} />
                )}
                Perto de mim
              </button>
            </div>

            {locationError && (
              <p className="mb-3 text-xs text-stone" role="status">
                {locationError}
              </p>
            )}

            {points.length > 0 && (
              <div className="mb-6 h-[320px] overflow-hidden rounded-[12px] border border-[var(--border-default)]">
                <PublicCellsMap
                  points={points}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  className="h-full w-full"
                />
              </div>
            )}

            {visible.length === 0 ? (
              <p className="text-sm text-stone">
                Nenhuma célula encontrada com esses filtros.
              </p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {visible.map((cell) => {
                  const distance =
                    position && cell.lat !== null && cell.lng !== null
                      ? distanceKm(position, { lat: cell.lat, lng: cell.lng })
                      : null;

                  return (
                    <li
                      key={cell.id}
                      onMouseEnter={() => setSelectedId(cell.id)}
                      className={`rounded-[12px] border bg-[var(--surface-base)] p-4 ${
                        selectedId === cell.id
                          ? "border-navy"
                          : "border-[var(--border-default)]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h2 className="text-sm font-medium text-ink dark:text-white">
                          {cell.name}
                        </h2>
                        <span className="shrink-0 rounded-4xl bg-[var(--surface-subtle)] px-2 py-0.5 text-xs text-stone">
                          {cell.group_type.name}
                        </span>
                      </div>

                      {cell.description && (
                        <p className="mt-1.5 text-sm font-light text-stone">{cell.description}</p>
                      )}

                      <dl className="mt-2 flex flex-col gap-1 text-xs text-stone">
                        <div className="flex items-center gap-1.5">
                          <Users size={13} strokeWidth={1.5} />
                          <dd>{cell.congregation.name}</dd>
                        </div>
                        {(cell.meeting_time || cell.recurrence) && (
                          <div className="flex items-center gap-1.5">
                            <Check size={13} strokeWidth={1.5} />
                            <dd>
                              {[recurrenceLabel(cell.recurrence), cell.meeting_time]
                                .filter(Boolean)
                                .join(" · ")}
                            </dd>
                          </div>
                        )}
                        {cell.address && (
                          <div className="flex items-center gap-1.5">
                            <MapPin size={13} strokeWidth={1.5} />
                            <dd>
                              {cell.address}
                              {distance !== null && ` · ${formatDistance(distance)}`}
                            </dd>
                          </div>
                        )}
                      </dl>

                      <div className="mt-3 flex items-center gap-2">
                        <Button
                          type="button"
                          onClick={() => setVisitTarget(cell)}
                          className="h-8 rounded-[8px] bg-navy text-sm font-medium text-white hover:bg-[var(--color-navy-dark)]"
                        >
                          Quero visitar
                        </Button>
                        {cell.lat !== null && cell.lng !== null && (
                          <a
                            href={`https://www.openstreetmap.org/?mlat=${cell.lat}&mlon=${cell.lng}#map=17/${cell.lat}/${cell.lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-navy underline underline-offset-4"
                          >
                            Como chegar
                          </a>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}

        <p className="mt-10 text-center text-xs text-muted-text">Orbien · Gestão de igrejas</p>
      </div>

      {visitTarget && (
        <VisitRequestModal
          cell={visitTarget}
          tenantSlug={tenantSlug}
          onClose={() => setVisitTarget(null)}
        />
      )}
    </div>
  );
}

function VisitRequestModal({
  cell,
  tenantSlug,
  onClose,
}: {
  cell: PublicCell;
  tenantSlug: string;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""); // honeypot anti-spam
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState("");
  const [sent, setSent] = useState(false);

  const canSubmit = name.trim().length >= 2 && (phone.trim() !== "" || email.trim() !== "");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setApiError("");
    setIsSubmitting(true);
    try {
      await api.post(`/public/small-groups/${cell.id}/visit-request`, {
        tenant_slug: tenantSlug,
        visitor_name: name.trim(),
        visitor_phone: phone.trim() || undefined,
        visitor_email: email.trim() || undefined,
        message: message.trim() || undefined,
        website: website || undefined,
      });
      setSent(true);
    } catch (err: unknown) {
      setApiError(
        apiErrorMessage(err, "Não foi possível enviar seu pedido agora. Tente novamente."),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal
      open
      // O `open` é fixo: a janela só existe enquanto o pai tem uma célula
      // escolhida, então todo `onOpenChange` que chega aqui é um fechamento
      // (X, Esc, clique fora).
      onOpenChange={onClose}
      title={sent ? "Pedido enviado" : `Visitar ${cell.name}`}
      description={
        sent ? undefined : "A liderança da célula recebe seu contato e responde por lá."
      }
    >
      {sent ? (
        <div className="flex flex-col gap-4">
          <Check size={36} strokeWidth={1.5} className="mx-auto text-teal" />
          <p className="text-center text-sm text-ink dark:text-white">
            Tudo certo! Alguém da célula vai falar com você.
          </p>
          <Button
            type="button"
            onClick={onClose}
            className="h-9 rounded-[8px] bg-navy text-sm font-medium text-white hover:bg-[var(--color-navy-dark)]"
          >
            Fechar
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="visitor_name" className="text-sm font-medium text-ink dark:text-white">
              Seu nome
            </Label>
            <Input
              id="visitor_name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              disabled={isSubmitting}
              className="rounded-[8px]"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="visitor_phone" className="text-sm font-medium text-ink dark:text-white">
              Telefone
            </Label>
            <Input
              id="visitor_phone"
              type="tel"
              placeholder="(11) 99999-0000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
              disabled={isSubmitting}
              className="rounded-[8px]"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="visitor_email" className="text-sm font-medium text-ink dark:text-white">
              E-mail
            </Label>
            <Input
              id="visitor_email"
              type="email"
              placeholder="voce@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              disabled={isSubmitting}
              className="rounded-[8px]"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="visitor_message" className="text-sm font-medium text-ink dark:text-white">
              Mensagem (opcional)
            </Label>
            <Input
              id="visitor_message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={isSubmitting}
              className="rounded-[8px]"
            />
          </div>

          {/* Honeypot anti-spam — invisível para humanos */}
          <input
            type="text"
            name="website"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="absolute left-[-9999px] h-0 w-0 opacity-0"
          />

          <p className="text-xs text-stone">Informe ao menos um telefone ou e-mail.</p>

          {apiError && (
            <div className="rounded-[8px] bg-crimson-dim px-3 py-2" role="alert">
              <p className="text-sm text-crimson">{apiError}</p>
            </div>
          )}

          <Button
            type="submit"
            disabled={isSubmitting || !canSubmit}
            className="h-9 rounded-[8px] bg-navy text-sm font-medium text-white hover:bg-[var(--color-navy-dark)] disabled:opacity-60"
          >
            {isSubmitting ? (
              <>
                <Loader2 size={16} className="mr-2 animate-spin" />
                Enviando…
              </>
            ) : (
              "Enviar pedido"
            )}
          </Button>
        </form>
      )}
    </Modal>
  );
}
