import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ApplyOrderTemplateModal,
  SaveOrderTemplateModal,
  summarizeOrderTemplate,
  type OrderTemplate,
} from "./OrderTemplateModals";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const item = (over: Partial<OrderTemplate["items"][number]> = {}) => ({
  id: "i1",
  name: "Abertura",
  sequence: 1,
  duration_minutes: 10,
  entry_kind: "program" as const,
  ...over,
});

const templates: OrderTemplate[] = [
  {
    id: "t1",
    name: "Culto de domingo",
    description: "Padrão semanal",
    items: [item(), item({ id: "i2", name: "Palavra", sequence: 2, duration_minutes: 40 }), item({ id: "i3", entry_kind: "logistics", duration_minutes: 0 })],
  },
  { id: "t2", name: "Culto de oração", description: null, items: [item()] },
];

function axiosError(status: number, message: string) {
  return { isAxiosError: true, response: { status, data: { message } } };
}

describe("summarizeOrderTemplate", () => {
  it("conta as etapas e soma só o tempo do programa", () => {
    expect(summarizeOrderTemplate(templates[0])).toBe("3 etapas · 50 min");
    expect(summarizeOrderTemplate(templates[1])).toBe("1 etapa · 10 min");
  });
});

describe("SaveOrderTemplateModal", () => {
  const onSaved = vi.fn();
  const onOpenChange = vi.fn();

  function Harness() {
    const [open, setOpen] = useState(true);
    return (
      <SaveOrderTemplateModal
        open={open}
        onOpenChange={(next) => {
          onOpenChange(next);
          setOpen(next);
        }}
        serviceOrderId="so1"
        defaultName="Culto Domingo"
        onSaved={onSaved}
      />
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sugere o nome da celebração e salva o molde a partir da OC", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { id: "t1" } });
    const user = userEvent.setup();
    render(<Harness />);

    const name = screen.getByLabelText("Nome");
    expect(name).toHaveValue("Culto Domingo");
    await user.clear(name);
    await user.type(name, "  Domingo manhã ");
    await user.type(screen.getByLabelText("Descrição (opcional)"), "Padrão");
    await user.click(screen.getByRole("button", { name: "Salvar molde" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/celebrations/order-templates", {
        name: "Domingo manhã",
        description: "Padrão",
        service_order_id: "so1",
      }),
    );
    expect(onSaved).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("omite a descrição vazia", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Salvar molde" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/celebrations/order-templates", {
        name: "Culto Domingo",
        description: undefined,
        service_order_id: "so1",
      }),
    );
  });

  it("exige um nome", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.clear(screen.getByLabelText("Nome"));
    await user.click(screen.getByRole("button", { name: "Salvar molde" }));

    expect(await screen.findByText("Dê um nome ao molde.")).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("mostra o erro do servidor e mantém o modal aberto", async () => {
    vi.mocked(api.post).mockRejectedValue(axiosError(400, "A ordem de culto não tem etapas para salvar como molde"));
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Salvar molde" }));

    expect(await screen.findByText("A ordem de culto não tem etapas para salvar como molde")).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("usa a mensagem padrão quando o erro não vem do servidor", async () => {
    vi.mocked(api.post).mockRejectedValue(new Error("rede"));
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Salvar molde" }));

    expect(await screen.findByText("Não foi possível salvar o molde.")).toBeInTheDocument();
  });

  it("restaura o nome sugerido ao reabrir e fecha pelo Cancelar", async () => {
    const user = userEvent.setup();
    function Reopen() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>abrir</button>
          <SaveOrderTemplateModal
            open={open}
            onOpenChange={setOpen}
            serviceOrderId="so1"
            defaultName="Culto Domingo"
            onSaved={onSaved}
          />
        </>
      );
    }
    render(<Reopen />);

    await user.click(screen.getByRole("button", { name: "abrir" }));
    await user.type(await screen.findByLabelText("Nome"), " extra");
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByLabelText("Nome")).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "abrir" }));
    expect(await screen.findByLabelText("Nome")).toHaveValue("Culto Domingo");
  });
});

describe("ApplyOrderTemplateModal", () => {
  const onApplied = vi.fn();
  const onOpenChange = vi.fn();

  function Harness({ hasItems = false }: { hasItems?: boolean }) {
    const [open, setOpen] = useState(true);
    return (
      <ApplyOrderTemplateModal
        open={open}
        onOpenChange={(next) => {
          onOpenChange(next);
          setOpen(next);
        }}
        serviceOrderId="so1"
        hasItems={hasItems}
        onApplied={onApplied}
      />
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockResolvedValue({ data: templates });
  });

  it("lista os moldes e só habilita Aplicar depois de escolher um", async () => {
    render(<Harness />);

    expect(await screen.findByText("Culto de domingo")).toBeInTheDocument();
    expect(screen.getByText("3 etapas · 50 min")).toBeInTheDocument();
    expect(screen.getByText("Padrão semanal")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aplicar molde" })).toBeDisabled();
    // OC vazia: não há o que decidir entre acrescentar e substituir.
    expect(screen.queryByText("Esta ordem já tem etapas")).not.toBeInTheDocument();
  });

  it("aplica o molde escolhido sem substituir quando a OC está vazia", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { created: 3, replaced: 0 } });
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(await screen.findByRole("radio", { name: /Culto de domingo/ }));
    await user.click(screen.getByRole("button", { name: "Aplicar molde" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/celebrations/order-templates/t1/apply", {
        service_order_id: "so1",
        replace: false,
      }),
    );
    expect(onApplied).toHaveBeenCalledWith(3);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("com etapas na OC, acrescenta por padrão e avisa o que a substituição apaga", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { created: 1, replaced: 0 } });
    const user = userEvent.setup();
    render(<Harness hasItems />);

    await user.click(await screen.findByRole("radio", { name: /Culto de oração/ }));
    expect(screen.getByRole("radio", { name: "Acrescentar depois das etapas atuais" })).toBeChecked();
    expect(screen.queryByText(/serão apagadas/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Substituir as etapas atuais" }));
    expect(screen.getByText("As etapas atuais e as músicas escolhidas nelas serão apagadas.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Aplicar molde" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/celebrations/order-templates/t2/apply", {
        service_order_id: "so1",
        replace: true,
      }),
    );
  });

  it("volta a acrescentar quando se desfaz a escolha de substituir", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { created: 1, replaced: 0 } });
    const user = userEvent.setup();
    render(<Harness hasItems />);

    await user.click(await screen.findByRole("radio", { name: /Culto de oração/ }));
    await user.click(screen.getByRole("radio", { name: "Substituir as etapas atuais" }));
    await user.click(screen.getByRole("radio", { name: "Acrescentar depois das etapas atuais" }));
    await user.click(screen.getByRole("button", { name: "Aplicar molde" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/celebrations/order-templates/t2/apply",
        expect.objectContaining({ replace: false }),
      ),
    );
  });

  it("explica como criar o primeiro molde quando não há nenhum", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] });
    render(<Harness hasItems />);

    expect(await screen.findByText("Nenhum molde salvo.")).toBeInTheDocument();
    expect(screen.queryByText("Esta ordem já tem etapas")).not.toBeInTheDocument();
  });

  it("trata resposta inesperada da lista como vazia", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: null });
    render(<Harness />);

    expect(await screen.findByText("Nenhum molde salvo.")).toBeInTheDocument();
  });

  it("mostra o erro quando a lista não carrega", async () => {
    vi.mocked(api.get).mockRejectedValue(new Error("rede"));
    render(<Harness />);

    expect(await screen.findByText("Não foi possível carregar os moldes.")).toBeInTheDocument();
  });

  it("mostra o erro ao aplicar e mantém o modal aberto", async () => {
    vi.mocked(api.post).mockRejectedValue(axiosError(404, "Ordem de culto não encontrada"));
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(await screen.findByRole("radio", { name: /Culto de oração/ }));
    await user.click(screen.getByRole("button", { name: "Aplicar molde" }));

    expect(await screen.findByText("Ordem de culto não encontrada")).toBeInTheDocument();
    expect(onApplied).not.toHaveBeenCalled();
  });

  it("não busca nada enquanto está fechado e recarrega a lista a cada abertura", async () => {
    const user = userEvent.setup();
    function Reopen() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>abrir</button>
          <ApplyOrderTemplateModal
            open={open}
            onOpenChange={setOpen}
            serviceOrderId="so1"
            hasItems={false}
            onApplied={onApplied}
          />
        </>
      );
    }
    render(<Reopen />);
    expect(api.get).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "abrir" }));
    await screen.findByText("Culto de domingo");
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByText("Culto de domingo")).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "abrir" }));
    await screen.findByText("Culto de domingo");
    expect(api.get).toHaveBeenCalledTimes(2);
    // A escolha anterior não sobrevive ao fechamento.
    expect(screen.getByRole("button", { name: "Aplicar molde" })).toBeDisabled();
  });
});
