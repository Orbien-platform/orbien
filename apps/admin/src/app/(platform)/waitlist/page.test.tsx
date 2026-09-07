import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import WaitlistPage from "./page";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn() } }));

vi.mock("@/components/tenants/CreateTenantModal", () => ({
  CreateTenantModal: ({
    open,
    onOpenChange,
    onCreated,
    lead,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreated: () => void;
    lead: { id: string; pastor_name: string } | null;
  }) => (
    <div>
      <span>provisionar:{open ? "aberto" : "fechado"}</span>
      <span>lead:{lead ? lead.pastor_name : "nenhum"}</span>
      <button onClick={onCreated}>avisar tenant criado</button>
      <button onClick={() => onOpenChange(false)}>fechar provisionar</button>
    </div>
  ),
}));

const getMock = vi.mocked(api.get);

function inscrito(overrides: Record<string, unknown> = {}) {
  return {
    id: "w-1",
    email: "pastor@igreja.com",
    pastor_name: "Pastor João",
    church_name: "Igreja Nova",
    city: "Passo Fundo",
    state: "RS",
    size_range: "ate_150",
    status: "pending",
    source: "site",
    created_at: "2026-08-20T12:00:00.000Z",
    tenant_id: null,
    ...overrides,
  };
}

function respondeCom(data: unknown[], total = data.length) {
  getMock.mockResolvedValue({ data: { data, total } } as never);
}

function ultimaUrl() {
  return getMock.mock.calls.at(-1)?.[0] as string;
}

beforeEach(() => {
  getMock.mockReset();
  respondeCom([inscrito()]);
});

describe("WaitlistPage", () => {
  it("lista os leads com contato, igreja, tamanho, origem, status e data", async () => {
    render(<WaitlistPage />);

    expect(await screen.findByText("Pastor João")).toBeInTheDocument();
    expect(getMock).toHaveBeenCalledWith("/admin/waitlist?limit=100");
    expect(screen.getByText("pastor@igreja.com")).toBeInTheDocument();
    expect(screen.getByText("Igreja Nova")).toBeInTheDocument();
    expect(screen.getByText("Passo Fundo · RS")).toBeInTheDocument();
    expect(screen.getByText("até 150")).toBeInTheDocument();
    expect(screen.getByText("site")).toBeInTheDocument();
    expect(screen.getByText("Pendente")).toBeInTheDocument();
    expect(screen.getByText("20/08/2026")).toBeInTheDocument();
    expect(screen.getByText(/Leads do site\. 1 inscrito\./)).toBeInTheDocument();
  });

  it("é somente leitura — não há como mover o status daqui", async () => {
    render(<WaitlistPage />);
    await screen.findByText("Pastor João");

    // Ver o comentário da tela: mover o status sem provisionar a partir do
    // lead deixaria `tenant_id` e `activated_at` nulos.
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("pluraliza a contagem e nomeia o filtro no texto", async () => {
    const user = userEvent.setup();
    respondeCom([inscrito(), inscrito({ id: "w-2" })], 2);

    render(<WaitlistPage />);
    expect(await screen.findByText(/2 inscritos\./)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ativados" }));

    await waitFor(() => expect(ultimaUrl()).toContain("status=activated"));
    expect(
      await screen.findByText(/inscritos em "Ativado"\./)
    ).toBeInTheDocument();
  });

  it("os cinco filtros de status viram parâmetro da consulta", async () => {
    const user = userEvent.setup();
    render(<WaitlistPage />);
    await screen.findByText("Pastor João");

    for (const [rotulo, valor] of [
      ["Pendentes", "pending"],
      ["Contatados", "contacted"],
      ["Ativados", "activated"],
      ["Recusados", "declined"],
    ] as const) {
      await user.click(screen.getByRole("button", { name: rotulo }));
      await waitFor(() => expect(ultimaUrl()).toContain(`status=${valor}`));
    }

    await user.click(screen.getByRole("button", { name: "Todos" }));
    await waitFor(() => expect(ultimaUrl()).toBe("/admin/waitlist?limit=100"));
  });

  it("clicar no filtro já ativo não refaz a busca", async () => {
    const user = userEvent.setup();
    render(<WaitlistPage />);
    await screen.findByText("Pastor João");
    const antes = getMock.mock.calls.length;

    await user.click(screen.getByRole("button", { name: "Todos" }));

    expect(getMock.mock.calls.length).toBe(antes);
  });

  it("mostra os quatro rótulos de status", async () => {
    respondeCom([
      inscrito({ id: "w-1", status: "pending" }),
      inscrito({ id: "w-2", status: "contacted" }),
      inscrito({ id: "w-3", status: "activated" }),
      inscrito({ id: "w-4", status: "declined" }),
    ]);

    render(<WaitlistPage />);

    expect(await screen.findByText("Pendente")).toBeInTheDocument();
    expect(screen.getByText("Contatado")).toBeInTheDocument();
    expect(screen.getByText("Ativado")).toBeInTheDocument();
    expect(screen.getByText("Recusado")).toBeInTheDocument();
  });

  it("traduz as quatro faixas de tamanho", async () => {
    respondeCom([
      inscrito({ id: "w-1", size_range: "ate_50" }),
      inscrito({ id: "w-2", size_range: "ate_150" }),
      inscrito({ id: "w-3", size_range: "ate_300" }),
      inscrito({ id: "w-4", size_range: "acima_300" }),
    ]);

    render(<WaitlistPage />);

    expect(await screen.findByText("até 50")).toBeInTheDocument();
    expect(screen.getByText("até 150")).toBeInTheDocument();
    expect(screen.getByText("até 300")).toBeInTheDocument();
    expect(screen.getByText("acima de 300")).toBeInTheDocument();
  });

  it("lead sem igreja, cidade ou origem mostra traço", async () => {
    respondeCom([
      inscrito({ church_name: null, city: null, state: null, source: null }),
    ]);

    render(<WaitlistPage />);

    await screen.findByText("Pastor João");
    // Igreja, localidade e origem.
    expect(screen.getAllByText("—")).toHaveLength(3);
  });

  it("lead com estado mas sem cidade mostra só o estado", async () => {
    respondeCom([inscrito({ city: null })]);

    render(<WaitlistPage />);

    expect(await screen.findByText("RS")).toBeInTheDocument();
  });

  it("erro na busca mostra o estado de erro da tabela, não o de lista vazia", async () => {
    getMock.mockRejectedValue(new Error("500"));

    render(<WaitlistPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar a waitlist."
    );
    expect(
      screen.queryByText("Nenhum inscrito com este filtro.")
    ).not.toBeInTheDocument();
    expect(screen.getByText(/0 inscritos\./)).toBeInTheDocument();
  });

  it("tentar de novo no erro de carregamento refaz a busca", async () => {
    const user = userEvent.setup();
    getMock.mockRejectedValue(new Error("500"));
    render(<WaitlistPage />);
    await screen.findByRole("alert");

    respondeCom([inscrito({ pastor_name: "Pastor Recuperado" })]);
    await user.click(screen.getByRole("button", { name: /tentar de novo/i }));

    expect(await screen.findByText("Pastor Recuperado")).toBeInTheDocument();
  });

  it("trocar de aba rápido não deixa a resposta antiga sobrescrever a nova", async () => {
    const user = userEvent.setup();
    render(<WaitlistPage />);
    await screen.findByText("Pastor João");

    let resolverPendentes!: (v: unknown) => void;
    getMock
      .mockImplementationOnce(
        () => new Promise((resolve) => (resolverPendentes = resolve))
      )
      .mockResolvedValueOnce({
        data: { data: [inscrito({ pastor_name: "Ativado Recente" })], total: 1 },
      } as never);

    await user.click(screen.getByRole("button", { name: "Pendentes" }));
    await user.click(screen.getByRole("button", { name: "Ativados" }));

    expect(await screen.findByText("Ativado Recente")).toBeInTheDocument();

    resolverPendentes({
      data: { data: [inscrito({ pastor_name: "Pendente Antigo" })], total: 1 },
    });

    await waitFor(() =>
      expect(screen.getByText("Ativado Recente")).toBeInTheDocument()
    );
    expect(screen.queryByText("Pendente Antigo")).not.toBeInTheDocument();
  });

  it("erro de busca cancelada também é descartado", async () => {
    const user = userEvent.setup();
    render(<WaitlistPage />);
    await screen.findByText("Pastor João");

    let rejeitarPendentes!: (e: unknown) => void;
    getMock
      .mockImplementationOnce(
        () => new Promise((_, reject) => (rejeitarPendentes = reject))
      )
      .mockResolvedValueOnce({
        data: { data: [inscrito({ pastor_name: "Ativado Recente" })], total: 1 },
      } as never);

    await user.click(screen.getByRole("button", { name: "Pendentes" }));
    await user.click(screen.getByRole("button", { name: "Ativados" }));

    expect(await screen.findByText("Ativado Recente")).toBeInTheDocument();

    rejeitarPendentes(new Error("500"));

    await waitFor(() =>
      expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    );
    expect(screen.getByText("Ativado Recente")).toBeInTheDocument();
  });

  it("abre o modal de provisionar com o lead da linha, e recarrega a lista ao criar", async () => {
    const user = userEvent.setup();
    render(<WaitlistPage />);
    await screen.findByText("Pastor João");

    expect(screen.getByText("provisionar:fechado")).toBeInTheDocument();
    expect(screen.getByText("lead:nenhum")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Provisionar/ }));

    expect(screen.getByText("provisionar:aberto")).toBeInTheDocument();
    expect(screen.getByText("lead:Pastor João")).toBeInTheDocument();

    const antes = getMock.mock.calls.length;
    await user.click(
      screen.getByRole("button", { name: "avisar tenant criado" })
    );

    await waitFor(() => expect(getMock.mock.calls.length).toBe(antes + 1));
  });

  it("fechar o modal sem criar limpa o lead selecionado", async () => {
    const user = userEvent.setup();
    render(<WaitlistPage />);
    await screen.findByText("Pastor João");

    await user.click(screen.getByRole("button", { name: /Provisionar/ }));
    expect(screen.getByText("lead:Pastor João")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "fechar provisionar" }));

    expect(screen.getByText("provisionar:fechado")).toBeInTheDocument();
    expect(screen.getByText("lead:nenhum")).toBeInTheDocument();
  });

  it("lead já provisionado não tem botão — mostra o rótulo em vez dele", async () => {
    respondeCom([inscrito({ tenant_id: "tenant-existente" })]);

    render(<WaitlistPage />);

    await screen.findByText("Pastor João");
    expect(screen.getByText("Já provisionado")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Provisionar/ })
    ).not.toBeInTheDocument();
  });
});
