import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DataTable, type Column } from "./DataTable";

interface Row {
  id: string;
  name: string;
}

const columns: Column<Row>[] = [
  { key: "name", header: "Nome", render: (row) => row.name },
];

describe("DataTable", () => {
  it("renderiza cabeçalho e linhas", () => {
    const rows: Row[] = [
      { id: "1", name: "Ana" },
      { id: "2", name: "Bruno" },
    ];
    render(<DataTable columns={columns} rows={rows} getRowKey={(r) => r.id} />);
    expect(screen.getByText("Nome")).toBeInTheDocument();
    expect(screen.getByText("Ana")).toBeInTheDocument();
    expect(screen.getByText("Bruno")).toBeInTheDocument();
  });

  it("mostra skeletons quando isLoading", () => {
    const { container } = render(
      <DataTable columns={columns} rows={[]} getRowKey={(r) => r.id} isLoading skeletonRows={3} />
    );
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(3);
  });

  it("mostra mensagem padrão de vazio quando não há linhas", () => {
    render(<DataTable columns={columns} rows={[]} getRowKey={(r) => r.id} />);
    expect(screen.getByText("Nenhum resultado encontrado.")).toBeInTheDocument();
  });

  it("mostra emptyState customizado", () => {
    render(
      <DataTable
        columns={columns}
        rows={[]}
        getRowKey={(r) => r.id}
        emptyState={<span>Sem pessoas</span>}
      />
    );
    expect(screen.getByText("Sem pessoas")).toBeInTheDocument();
  });

  it("chama onRowClick com a linha clicada", async () => {
    const onRowClick = vi.fn();
    const rows: Row[] = [{ id: "1", name: "Ana" }];
    render(
      <DataTable columns={columns} rows={rows} getRowKey={(r) => r.id} onRowClick={onRowClick} />
    );
    await userEvent.click(screen.getByText("Ana"));
    expect(onRowClick).toHaveBeenCalledWith(rows[0]);
  });

  it("aplica width da coluna quando informado", () => {
    const withWidth: Column<Row>[] = [{ key: "name", header: "Nome", width: "120px", render: (r) => r.name }];
    render(<DataTable columns={withWidth} rows={[]} getRowKey={(r) => r.id} />);
    const th = screen.getByText("Nome");
    expect(th).toHaveStyle({ width: "120px" });
  });
});
