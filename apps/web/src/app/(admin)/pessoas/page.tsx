"use client";

import { useCallback, useEffect, useState } from "react";
import { UserPlus, Upload, HelpCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/SearchInput";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { NoAccessState } from "@/components/ui/NoAccessState";
import { PersonSheet } from "@/components/persons/PersonSheet";
import { CreateVisitorModal } from "@/components/persons/CreateVisitorModal";
import { ImportCsvModal } from "@/components/persons/ImportCsvModal";
import { ImportHelpModal } from "@/components/persons/ImportHelpModal";
import { useAuth } from "@/hooks/useAuth";
import api, { isForbidden } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Person {
  id: string;
  full_name: string;
  phone?: string;
  email?: string;
  classification: string;
  created_at: string;
}

interface PersonsResponse {
  data: Person[];
  total: number;
  page: number;
  limit: number;
}

const LIMIT = 20;

function formatPhone(phone?: string): string {
  if (!phone) return "—";
  const d = phone.replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return phone;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PessoasPage() {
  const { user } = useAuth();
  const isPastor = user?.roles?.includes("pastor") ?? false;

  const [persons, setPersons] = useState<Person[]>([]);
  const [total, setTotal] = useState(0);
  const [accessDenied, setAccessDenied] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [classification, setClassification] = useState("");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importHelpOpen, setImportHelpOpen] = useState(false);

  // Uma requisição por combinação de página/busca/classificação; `reloadTick`
  // força uma nova quando algo muda fora da tabela (criar, importar, editar).
  const [reloadTick, setReloadTick] = useState(0);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const requestKey = `${page}|${search}|${classification}|${reloadTick}`;
  // Carregamento derivado: qual requisição já terminou. Evita setState
  // síncrono dentro do effect, que dispara renders em cascata.
  const isLoading = loadedKey !== requestKey;

  const reloadPersons = useCallback(() => setReloadTick((t) => t + 1), []);

  // Cadeia de promises em vez de async/await: assim todo setState acontece
  // dentro de um callback, nunca de forma síncrona no corpo do effect. O
  // cancelamento substitui o antigo contador de requisição — evita que uma
  // resposta antiga sobrescreva a lista quando página/filtro mudam antes.
  useEffect(() => {
    const signal = { cancelled: false };
    const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
    if (search) params.set("search", search);
    if (classification) params.set("classification", classification);
    api
      .get<PersonsResponse>(`/persons?${params}`)
      .then(({ data }) => {
        if (signal.cancelled) return;
        setPersons(data.data);
        setTotal(data.total);
        setAccessDenied(false);
      })
      .catch((error) => {
        if (signal.cancelled) return;
        setPersons([]);
        setTotal(0);
        // 403 não é lista vazia: sem isto, quem não tem o papel lia
        // "Nenhuma pessoa cadastrada ainda".
        setAccessDenied(isForbidden(error));
      })
      .finally(() => {
        if (!signal.cancelled) setLoadedKey(requestKey);
      });
    return () => {
      signal.cancelled = true;
    };
  }, [requestKey, page, search, classification]);

  const handleSearch = useCallback((q: string) => {
    setPage(1);
    setSearch(q);
  }, []);

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  const columns: Column<Person>[] = [
    {
      key: "name",
      header: "Nome",
      render: (row) => (
        <span className="font-medium text-ink dark:text-white">{row.full_name}</span>
      ),
    },
    {
      key: "phone",
      header: "Telefone",
      width: "140px",
      render: (row) => (
        <span className="text-stone">{formatPhone(row.phone)}</span>
      ),
    },
    {
      key: "classification",
      header: "Classificação",
      width: "150px",
      render: (row) => <StatusBadge classification={row.classification} />,
    },
    {
      key: "created_at",
      header: "Cadastro",
      width: "120px",
      render: (row) => (
        <span className="text-stone">{formatDate(row.created_at)}</span>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-medium text-ink dark:text-white">Pessoas</h1>
          {total > 0 && (
            <p className="mt-0.5 text-sm text-stone">
              {total} pessoa{total !== 1 ? "s" : ""} cadastrada{total !== 1 ? "s" : ""}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {!isPastor && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 rounded-[8px]"
                onClick={() => setImportHelpOpen(true)}
              >
                <HelpCircle size={14} strokeWidth={1.5} />
                Como importar?
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 rounded-[8px]"
                onClick={() => setImportOpen(true)}
              >
                <Upload size={14} strokeWidth={1.5} />
                Importar CSV
              </Button>
            </>
          )}
          <Button
            size="sm"
            className="gap-1.5 rounded-[8px] bg-navy text-white hover:bg-[var(--color-navy-dark)]"
            onClick={() => setCreateOpen(true)}
          >
            <UserPlus size={14} strokeWidth={1.5} />
            Cadastrar visitante
          </Button>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          placeholder="Buscar por nome…"
          onSearch={handleSearch}
          className="w-64"
        />
        <select
          value={classification}
          onChange={(e) => { setClassification(e.target.value); setPage(1); }}
          className="h-8 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] px-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-navy/20 dark:text-white"
        >
          <option value="">Todas as classificações</option>
          <option value="visitor">Visitantes</option>
          <option value="attendee">Frequentadores</option>
          <option value="member">Membros</option>
        </select>
      </div>

      {/* ── Table ── */}
      <DataTable
        columns={columns}
        rows={persons}
        getRowKey={(p) => p.id}
        onRowClick={(p) => { setSelectedId(p.id); setSheetOpen(true); }}
        isLoading={isLoading}
        emptyState={
          accessDenied ? (
            <NoAccessState resource="Pessoas" />
          ) : search || classification ? (
            "Nenhuma pessoa encontrada com esses filtros."
          ) : (
            "Nenhuma pessoa cadastrada ainda."
          )
        }
      />

      {/* ── Pagination ── */}
      {!isLoading && total > LIMIT && (
        <div className="flex items-center justify-between text-sm text-stone">
          <span>
            {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} de {total}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              className="rounded-[8px]"
              aria-label="Página anterior"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              <ChevronLeft size={14} />
            </Button>
            <span className="px-2 text-xs">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              className="rounded-[8px]"
              aria-label="Próxima página"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              <ChevronRight size={14} />
            </Button>
          </div>
        </div>
      )}

      {/* ── Side sheet ── */}
      <PersonSheet
        personId={selectedId}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onUpdated={reloadPersons}
      />

      {/* ── Modals ── */}
      <CreateVisitorModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => { setPage(1); reloadPersons(); }}
      />
      <ImportCsvModal
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={reloadPersons}
      />
      <ImportHelpModal
        open={importHelpOpen}
        onOpenChange={setImportHelpOpen}
      />
    </div>
  );
}
