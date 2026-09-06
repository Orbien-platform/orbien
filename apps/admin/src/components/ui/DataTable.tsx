import { AlertCircle, RotateCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  header: string;
  width?: string;
  render: (row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  isLoading?: boolean;
  skeletonRows?: number;
  emptyState?: React.ReactNode;
  // Falha ao carregar é um estado diferente de "carregou e não achou nada":
  // a linha vazia diz "não há dados", esta diz "não sabemos se há". Misturar
  // as duas faz o usuário ler uma lista zerada como fato quando na verdade a
  // requisição falhou.
  error?: React.ReactNode;
  onRetry?: () => void;
  className?: string;
}

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  onRowClick,
  isLoading,
  skeletonRows = 8,
  emptyState,
  error,
  onRetry,
  className,
}: DataTableProps<T>) {
  return (
    <div className={cn("w-full overflow-x-auto rounded-[12px] border border-[var(--border-default)]", className)}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border-default)] bg-[var(--surface-subtle)]">
            {columns.map((col) => (
              <th
                key={col.key}
                style={col.width ? { width: col.width } : undefined}
                className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-stone"
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border-default)] bg-[var(--surface-base)]">
          {isLoading
            ? Array.from({ length: skeletonRows }).map((_, i) => (
                <tr key={i}>
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-3">
                      <Skeleton className="h-4 w-full max-w-[120px]" />
                    </td>
                  ))}
                </tr>
              ))
            : error
              ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-12">
                    <div
                      role="alert"
                      className="flex flex-col items-center gap-2 text-center text-sm text-stone"
                    >
                      <AlertCircle size={20} strokeWidth={1.5} className="text-crimson" />
                      <span>{error}</span>
                      {onRetry && (
                        <button
                          type="button"
                          onClick={onRetry}
                          className="mt-1 inline-flex items-center gap-1.5 rounded-[8px] border border-[var(--border-default)] px-2.5 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-[var(--surface-subtle)] dark:text-white"
                        >
                          <RotateCw size={13} strokeWidth={1.5} />
                          Tentar de novo
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
              : rows.length === 0
              ? (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="px-4 py-12 text-center text-sm text-stone"
                  >
                    {emptyState ?? "Nenhum resultado encontrado."}
                  </td>
                </tr>
              )
              : rows.map((row) => (
                <tr
                  key={getRowKey(row)}
                  onClick={() => onRowClick?.(row)}
                  className={cn(
                    "transition-colors",
                    onRowClick && "cursor-pointer hover:bg-[var(--surface-subtle)]"
                  )}
                >
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-3">
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  );
}
