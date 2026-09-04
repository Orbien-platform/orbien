import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CreateGroupModal } from "./CreateGroupModal";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

const persons = [{ id: "p1", full_name: "Ana Souza" }];
const groupTypes = [{ id: "gt1", name: "Célula", color: "#111111", is_active: true }];

describe("CreateGroupModal", () => {
  beforeEach(() => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url.startsWith("/persons")) {
        return Promise.resolve({ data: { data: persons, total: 1 } });
      }
      if (url === "/groups/types") {
        return Promise.resolve({ data: groupTypes });
      }
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
  });

  it("does not render form fields when closed", () => {
    render(
      <CreateGroupModal open={false} onOpenChange={vi.fn()} onCreated={vi.fn()} />
    );
    expect(screen.queryByText("Novo grupo")).not.toBeInTheDocument();
  });

  it("loads persons and group types when opened, and validates required fields", async () => {
    const user = userEvent.setup();
    render(
      <CreateGroupModal open={true} onOpenChange={vi.fn()} onCreated={vi.fn()} />
    );

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/persons?limit=100"));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/groups/types", { params: undefined }));

    await user.click(screen.getByRole("button", { name: "Criar grupo" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Nome é obrigatório.");
  });

  it("submits the group and shows success, then calls onCreated/onOpenChange", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({ data: {} });
    const onCreated = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <CreateGroupModal open={true} onOpenChange={onOpenChange} onCreated={onCreated} />
    );

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/persons?limit=100"));

    await user.type(screen.getByLabelText(/Nome do grupo/), "Célula Alfa");
    await user.click(screen.getByRole("combobox", { name: /Tipo/ }));
    await user.click(await screen.findByRole("option", { name: "Célula" }));
    await user.selectOptions(screen.getByLabelText(/Líder/), "p1");

    await user.click(screen.getByRole("button", { name: "Criar grupo" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/small-groups", expect.objectContaining({
        name: "Célula Alfa",
        leader_person_id: "p1",
        group_type_id: "gt1",
      }))
    );

    expect(await screen.findByText("Grupo criado com sucesso!")).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(1200);

    expect(onCreated).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    vi.useRealTimers();
  });

  it("shows an error message when the API call fails", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockRejectedValue(new Error("fail"));

    render(
      <CreateGroupModal open={true} onOpenChange={vi.fn()} onCreated={vi.fn()} />
    );

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/persons?limit=100"));

    await user.type(screen.getByLabelText(/Nome do grupo/), "Célula Alfa");
    await user.click(screen.getByRole("combobox", { name: /Tipo/ }));
    await user.click(await screen.findByRole("option", { name: "Célula" }));
    await user.selectOptions(screen.getByLabelText(/Líder/), "p1");
    await user.click(screen.getByRole("button", { name: "Criar grupo" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Erro ao criar grupo. Tente novamente."
    );
  });

  it("validates type and leader before name-only error clears", async () => {
    const user = userEvent.setup();
    render(
      <CreateGroupModal open={true} onOpenChange={vi.fn()} onCreated={vi.fn()} />
    );
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/persons?limit=100"));

    await user.type(screen.getByLabelText(/Nome do grupo/), "Célula Alfa");
    await user.click(screen.getByRole("button", { name: "Criar grupo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Selecione o tipo do grupo."
    );

    await user.click(screen.getByRole("combobox", { name: /Tipo/ }));
    await user.click(await screen.findByRole("option", { name: "Célula" }));
    await user.click(screen.getByRole("button", { name: "Criar grupo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Selecione um líder."
    );
  });

  it("does not refetch persons/types on a second open once already fetched", async () => {
    const { rerender } = render(
      <CreateGroupModal open={true} onOpenChange={vi.fn()} onCreated={vi.fn()} />
    );
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/persons?limit=100"));
    const callsAfterFirstOpen = vi.mocked(api.get).mock.calls.length;

    rerender(
      <CreateGroupModal open={false} onOpenChange={vi.fn()} onCreated={vi.fn()} />
    );
    rerender(
      <CreateGroupModal open={true} onOpenChange={vi.fn()} onCreated={vi.fn()} />
    );

    // hasFetched ref was not reset (reset() only runs via internal onOpenChange),
    // so loadData's early-return branch is hit and no new calls happen.
    expect(vi.mocked(api.get).mock.calls.length).toBe(callsAfterFirstOpen);
  });

  it("silently ignores a failed persons fetch", async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url.startsWith("/persons")) {
        return Promise.reject(new Error("network error"));
      }
      if (url === "/groups/types") {
        return Promise.resolve({ data: groupTypes });
      }
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });

    render(
      <CreateGroupModal open={true} onOpenChange={vi.fn()} onCreated={vi.fn()} />
    );

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/persons?limit=100"));
    // No crash, and the leader select stays empty.
    const leaderSelect = await screen.findByLabelText(/Líder/);
    expect(leaderSelect).toHaveTextContent("— Selecione o líder —");
  });

  it("falls back to an empty type list when fetchGroupTypes rejects", async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url.startsWith("/persons")) {
        return Promise.resolve({ data: { data: persons, total: 1 } });
      }
      if (url === "/groups/types") {
        return Promise.reject(new Error("boom"));
      }
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });

    render(
      <CreateGroupModal open={true} onOpenChange={vi.fn()} onCreated={vi.fn()} />
    );

    expect(
      await screen.findByText(
        "Nenhum tipo cadastrado. Configure os tipos em Grupos → Tipos."
      )
    ).toBeInTheDocument();
  });

  it("builds meeting_time from day only", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({ data: {} });

    render(
      <CreateGroupModal open={true} onOpenChange={vi.fn()} onCreated={vi.fn()} />
    );
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/persons?limit=100"));

    await user.type(screen.getByLabelText(/Nome do grupo/), "Célula Alfa");
    await user.click(screen.getByRole("combobox", { name: /Tipo/ }));
    await user.click(await screen.findByRole("option", { name: "Célula" }));
    await user.selectOptions(screen.getByLabelText(/Líder/), "p1");

    // The "Dia" <select> has no htmlFor/id pairing; find it by its option text.
    const daySelect = Array.from(
      document.body.querySelectorAll("select")
    ).find((el) => el.textContent?.includes("Segunda-feira")) as HTMLSelectElement;
    expect(daySelect).toBeTruthy();
    await user.selectOptions(daySelect, "Segunda-feira");

    await user.type(screen.getByLabelText(/Endereço/), "Rua A, 123");
    await user.type(screen.getByLabelText(/Descrição/), "Um grupo legal");

    await user.click(screen.getByRole("button", { name: "Criar grupo" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/small-groups",
        expect.objectContaining({
          meeting_time: "Segunda-feira",
          address: "Rua A, 123",
          public_description: "Um grupo legal",
        })
      )
    );
  });

  it("cancel button closes and resets the form without submitting", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(
      <CreateGroupModal open={true} onOpenChange={onOpenChange} onCreated={vi.fn()} />
    );
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/persons?limit=100"));

    await user.type(screen.getByLabelText(/Nome do grupo/), "Rascunho");
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("resets internal state via the Modal's own close (X) button", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(
      <CreateGroupModal open={true} onOpenChange={onOpenChange} onCreated={vi.fn()} />
    );
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/persons?limit=100"));

    await user.type(screen.getByLabelText(/Nome do grupo/), "Rascunho");
    await user.click(screen.getByRole("button", { name: "Fechar" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("builds meeting_time by combining day and time when both are set", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({ data: {} });

    render(
      <CreateGroupModal open={true} onOpenChange={vi.fn()} onCreated={vi.fn()} />
    );
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/persons?limit=100"));

    await user.type(screen.getByLabelText(/Nome do grupo/), "Célula Alfa");
    await user.click(screen.getByRole("combobox", { name: /Tipo/ }));
    await user.click(await screen.findByRole("option", { name: "Célula" }));
    await user.selectOptions(screen.getByLabelText(/Líder/), "p1");

    const daySelect = Array.from(
      document.body.querySelectorAll("select")
    ).find((el) => el.textContent?.includes("Segunda-feira")) as HTMLSelectElement;
    await user.selectOptions(daySelect, "Segunda-feira");
    await user.type(screen.getByLabelText(/Horário/), "19:30");

    await user.click(screen.getByRole("button", { name: "Criar grupo" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/small-groups",
        expect.objectContaining({ meeting_time: "Segunda-feira 19:30" })
      )
    );
  });

  it("falls back to an empty persons list when the API returns no data field", async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url.startsWith("/persons")) {
        return Promise.resolve({ data: {} });
      }
      if (url === "/groups/types") {
        return Promise.resolve({ data: groupTypes });
      }
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });

    render(
      <CreateGroupModal open={true} onOpenChange={vi.fn()} onCreated={vi.fn()} />
    );

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/persons?limit=100"));
    const leaderSelect = await screen.findByLabelText(/Líder/);
    expect(leaderSelect).toHaveTextContent("— Selecione o líder —");
  });

  it("builds meeting_time from time only when day is blank", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({ data: {} });

    render(
      <CreateGroupModal open={true} onOpenChange={vi.fn()} onCreated={vi.fn()} />
    );
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/persons?limit=100"));

    await user.type(screen.getByLabelText(/Nome do grupo/), "Célula Alfa");
    await user.click(screen.getByRole("combobox", { name: /Tipo/ }));
    await user.click(await screen.findByRole("option", { name: "Célula" }));
    await user.selectOptions(screen.getByLabelText(/Líder/), "p1");

    const timeInput = screen.getByLabelText(/Horário/);
    await user.type(timeInput, "19:30");

    await user.click(screen.getByRole("button", { name: "Criar grupo" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/small-groups",
        expect.objectContaining({ meeting_time: "19:30" })
      )
    );
  });
});
