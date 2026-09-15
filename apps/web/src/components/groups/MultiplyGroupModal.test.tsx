import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MultiplyGroupModal } from "./MultiplyGroupModal";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

const persons = [
  { id: "p1", full_name: "Ana Souza" },
  { id: "p2", full_name: "Bruno Lima" },
];

const members = [
  { id: "m1", role: "member", person: { id: "p1", full_name: "Ana Souza" } },
  { id: "m2", role: "member", person: { id: "p3", full_name: "Carla Reis" } },
];

describe("MultiplyGroupModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url.startsWith("/persons")) {
        return Promise.resolve({ data: { data: persons, total: 2 } });
      }
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
  });

  it("does not render form fields when closed", () => {
    render(
      <MultiplyGroupModal
        open={false}
        onOpenChange={vi.fn()}
        groupId="sg1"
        members={members}
        onMultiplied={vi.fn()}
      />
    );
    expect(screen.queryByText("Multiplicar célula")).not.toBeInTheDocument();
  });

  it("validates required fields before submitting", async () => {
    const user = userEvent.setup();
    render(
      <MultiplyGroupModal
        open={true}
        onOpenChange={vi.fn()}
        groupId="sg1"
        members={members}
        onMultiplied={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Multiplicar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Nome é obrigatório.");

    await user.type(screen.getByLabelText(/Nome da célula filha/), "Célula Filha");
    await user.click(screen.getByRole("button", { name: "Multiplicar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Selecione o novo líder.");
  });

  it("submits the multiply request with the chosen members and shows success", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({ data: { id: "child-1" } });
    const onMultiplied = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <MultiplyGroupModal
        open={true}
        onOpenChange={onOpenChange}
        groupId="sg1"
        members={members}
        onMultiplied={onMultiplied}
      />
    );

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/persons?limit=100"));

    await user.type(screen.getByLabelText(/Nome da célula filha/), "Célula Filha");
    await user.selectOptions(screen.getByLabelText(/Novo líder/), "p2");
    await user.click(screen.getByRole("checkbox", { name: "Ana Souza" }));

    await user.click(screen.getByRole("button", { name: "Multiplicar" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/small-groups/sg1/multiply", {
        name: "Célula Filha",
        leader_person_id: "p2",
        member_ids: ["p1"],
      })
    );

    expect(await screen.findByText("Célula multiplicada com sucesso!")).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(1200);

    expect(onMultiplied).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    vi.useRealTimers();
  });

  it("shows the 400 validation message from the API on failure", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockRejectedValue({
      response: { status: 400, data: { message: "Um ou mais membros informados não pertencem a este grupo" } },
      isAxiosError: true,
    });

    render(
      <MultiplyGroupModal
        open={true}
        onOpenChange={vi.fn()}
        groupId="sg1"
        members={members}
        onMultiplied={vi.fn()}
      />
    );

    await user.type(screen.getByLabelText(/Nome da célula filha/), "Célula Filha");
    await user.selectOptions(screen.getByLabelText(/Novo líder/), "p2");
    await user.click(screen.getByRole("button", { name: "Multiplicar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Um ou mais membros informados não pertencem a este grupo"
    );
  });

  it("shows a generic error message when the failure is not a 400", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockRejectedValue(new Error("network down"));

    render(
      <MultiplyGroupModal
        open={true}
        onOpenChange={vi.fn()}
        groupId="sg1"
        members={members}
        onMultiplied={vi.fn()}
      />
    );

    await user.type(screen.getByLabelText(/Nome da célula filha/), "Célula Filha");
    await user.selectOptions(screen.getByLabelText(/Novo líder/), "p2");
    await user.click(screen.getByRole("button", { name: "Multiplicar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Erro ao multiplicar célula. Tente novamente."
    );
  });

  it("shows a placeholder when the group has no members", () => {
    render(
      <MultiplyGroupModal
        open={true}
        onOpenChange={vi.fn()}
        groupId="sg1"
        members={[]}
        onMultiplied={vi.fn()}
      />
    );

    expect(screen.getByText("Nenhum membro nesta célula.")).toBeInTheDocument();
  });

  it("cancel button closes without submitting", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(
      <MultiplyGroupModal
        open={true}
        onOpenChange={onOpenChange}
        groupId="sg1"
        members={members}
        onMultiplied={vi.fn()}
      />
    );

    await user.type(screen.getByLabelText(/Nome da célula filha/), "Rascunho");
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(api.post).not.toHaveBeenCalled();
  });

  it("fecha e limpa o rascunho ao pressionar Esc, sem submeter", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(
      <MultiplyGroupModal
        open={true}
        onOpenChange={onOpenChange}
        groupId="sg1"
        members={members}
        onMultiplied={vi.fn()}
      />
    );

    await user.type(screen.getByLabelText(/Nome da célula filha/), "Rascunho");
    await user.keyboard("{Escape}");

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(api.post).not.toHaveBeenCalled();
  });

  it("desmarca um membro já selecionado ao clicar de novo", async () => {
    const user = userEvent.setup();
    render(
      <MultiplyGroupModal
        open={true}
        onOpenChange={vi.fn()}
        groupId="sg1"
        members={members}
        onMultiplied={vi.fn()}
      />
    );

    const checkbox = screen.getByRole("checkbox", { name: "Ana Souza" });
    await user.click(checkbox);
    expect(checkbox).toBeChecked();
    await user.click(checkbox);
    expect(checkbox).not.toBeChecked();
  });

  it("não busca pessoas de novo ao reabrir sem desmontar (hasFetched já verdadeiro)", async () => {
    const { rerender } = render(
      <MultiplyGroupModal
        open={true}
        onOpenChange={vi.fn()}
        groupId="sg1"
        members={members}
        onMultiplied={vi.fn()}
      />
    );

    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));

    rerender(
      <MultiplyGroupModal
        open={false}
        onOpenChange={vi.fn()}
        groupId="sg1"
        members={members}
        onMultiplied={vi.fn()}
      />
    );
    rerender(
      <MultiplyGroupModal
        open={true}
        onOpenChange={vi.fn()}
        groupId="sg1"
        members={members}
        onMultiplied={vi.fn()}
      />
    );

    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it("mantém a lista de líderes vazia quando a resposta de /persons não traz `data`", async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url.startsWith("/persons")) {
        return Promise.resolve({ data: {} });
      }
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });

    render(
      <MultiplyGroupModal
        open={true}
        onOpenChange={vi.fn()}
        groupId="sg1"
        members={members}
        onMultiplied={vi.fn()}
      />
    );

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/persons?limit=100"));
    const select = screen.getByLabelText(/Novo líder/) as HTMLSelectElement;
    expect(select.options).toHaveLength(1);
  });

  it("ignora silenciosamente a falha ao carregar pessoas para o select de líder", async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url.startsWith("/persons")) {
        return Promise.reject(new Error("network down"));
      }
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });

    render(
      <MultiplyGroupModal
        open={true}
        onOpenChange={vi.fn()}
        groupId="sg1"
        members={members}
        onMultiplied={vi.fn()}
      />
    );

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/persons?limit=100"));
    const select = screen.getByLabelText(/Novo líder/) as HTMLSelectElement;
    expect(select.options).toHaveLength(1);
  });

  it("mostra a mensagem genérica de 400 quando a API não traz `message`", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockRejectedValue({
      response: { status: 400, data: {} },
      isAxiosError: true,
    });

    render(
      <MultiplyGroupModal
        open={true}
        onOpenChange={vi.fn()}
        groupId="sg1"
        members={members}
        onMultiplied={vi.fn()}
      />
    );

    await user.type(screen.getByLabelText(/Nome da célula filha/), "Célula Filha");
    await user.selectOptions(screen.getByLabelText(/Novo líder/), "p2");
    await user.click(screen.getByRole("button", { name: "Multiplicar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Dados inválidos para multiplicar a célula."
    );
  });
});
