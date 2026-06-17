"use client";

import { Download } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/button";

interface ImportHelpModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const COLUMNS = [
  { field: "Nome", required: "Obrigatório", note: "—" },
  { field: "Telefone", required: "Ao menos um dos dois", note: 'Qualquer formato, ex: (54) 99999-8888' },
  { field: "E-mail", required: "Ao menos um dos dois", note: "—" },
  { field: "Sexo", required: "Opcional", note: "M, F ou Outro" },
  { field: "Data de nascimento", required: "Opcional", note: "DD/MM/AAAA ou AAAA-MM-DD" },
  { field: "Classificação", required: "Opcional", note: "membro, frequentador (padrão: visitante)" },
];

const CSV_TEMPLATE = [
  "nome,telefone,email,sexo,nascimento,classificacao",
  "Maria Silva,(54) 99999-8888,maria@email.com,F,15/01/1990,membro",
  "João Santos,(54) 98888-7777,,M,,frequentador",
].join("\n");

function downloadCsv() {
  const blob = new Blob([CSV_TEMPLATE], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "modelo-importacao-pessoas.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export function ImportHelpModal({ open, onOpenChange }: ImportHelpModalProps) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Importar pessoas — guia rápido"
      description="Siga as instruções abaixo para preparar seu arquivo de importação."
    >
      <div className="flex flex-col gap-5">
        {/* Section 1 — Columns */}
        <section>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone">Colunas</p>
          <div className="overflow-hidden rounded-[8px] border border-[var(--border-default)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-default)] bg-[var(--surface-subtle)]">
                  <th className="py-2 pl-3 text-left text-xs font-medium text-stone">Campo</th>
                  <th className="py-2 pr-3 text-left text-xs font-medium text-stone">Obrigatoriedade</th>
                  <th className="py-2 pr-3 text-left text-xs font-medium text-stone">Observação</th>
                </tr>
              </thead>
              <tbody>
                {COLUMNS.map((col) => (
                  <tr key={col.field} className="border-t border-[var(--border-default)]">
                    <td className="py-2 pl-3 text-xs font-medium text-ink dark:text-white">{col.field}</td>
                    <td className="py-2 pr-3 text-xs text-stone">{col.required}</td>
                    <td className="py-2 pr-3 text-xs text-stone">{col.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Section 2 — Formats */}
        <section>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-stone">Formatos aceitos</p>
          <p className="text-sm text-ink dark:text-white">
            Aceitamos arquivos <span className="font-medium">.csv</span> (separador vírgula, UTF-8) e{" "}
            <span className="font-medium">.xlsx/.xls</span>.
          </p>
          <p className="mt-1 text-sm text-stone">
            Os nomes das colunas podem variar — o sistema reconhece automaticamente variações como{" "}
            <span className="font-medium text-ink dark:text-white">
              &quot;telefone&quot;, &quot;celular&quot;, &quot;whatsapp&quot;, &quot;fone&quot;
            </span>
            .
          </p>
        </section>

        {/* Section 3 — Download template */}
        <section>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone">Baixar modelo</p>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 rounded-[8px]"
            onClick={downloadCsv}
          >
            <Download size={13} strokeWidth={1.5} />
            Baixar modelo CSV
          </Button>
        </section>

        <div className="flex justify-end border-t border-[var(--border-default)] pt-4">
          <Button
            variant="outline"
            size="sm"
            className="rounded-[8px]"
            onClick={() => onOpenChange(false)}
          >
            Fechar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
