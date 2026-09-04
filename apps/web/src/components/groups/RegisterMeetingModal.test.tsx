import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { RegisterMeetingModal } from "./RegisterMeetingModal";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

const members = [
  { id: "m1", role: "leader", person: { id: "p1", full_name: "Ana Souza" } },
  { id: "m2", role: "member", person: { id: "p2", full_name: "Bruno Lima" } },
];

describe("RegisterMeetingModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not render form fields when closed", () => {
    render(
      <RegisterMeetingModal
        open={false}
        onOpenChange={vi.fn()}
        groupId="g1"
        groupName="Célula Alfa"
        members={members}
        onRegistered={vi.fn()}
      />
    );
    expect(screen.queryByText("Registrar reunião")).not.toBeInTheDocument();
  });

  it("requires the date and creates the meeting, moving to the attendance step", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({ data: { id: "meet-1" } });

    render(
      <RegisterMeetingModal
        open={true}
        onOpenChange={vi.fn()}
        groupId="g1"
        groupName="Célula Alfa"
        members={members}
        onRegistered={vi.fn()}
      />
    );

    await user.type(screen.getByLabelText(/Tema/), "Estudo de Romanos");
    await user.click(screen.getByRole("button", { name: "Registrar e marcar presença" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/small-groups/g1/meetings",
        expect.objectContaining({ topic: "Estudo de Romanos" })
      )
    );

    expect(await screen.findByText("Ana Souza")).toBeInTheDocument();
    expect(screen.getByText("Bruno Lima")).toBeInTheDocument();
    expect(screen.getByText("0/2 presentes")).toBeInTheDocument();
  });

  it("shows a fallback message when the meetings endpoint is unavailable (404)", async () => {
    const user = userEvent.setup();
    const err = Object.assign(new Error("not found"), { response: { status: 404 } });
    vi.mocked(api.post).mockRejectedValue(err);

    render(
      <RegisterMeetingModal
        open={true}
        onOpenChange={vi.fn()}
        groupId="g1"
        groupName="Célula Alfa"
        members={members}
        onRegistered={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Registrar e marcar presença" }));

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent("Reuniões ainda não disponíveis neste ambiente. Tente em produção.");
  });

  it("shows a generic error message for non-404 failures", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockRejectedValue(new Error("boom"));

    render(
      <RegisterMeetingModal
        open={true}
        onOpenChange={vi.fn()}
        groupId="g1"
        groupName="Célula Alfa"
        members={members}
        onRegistered={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Registrar e marcar presença" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Erro ao registrar reunião.");
  });

  it("toggles attendance for a member and updates the counter", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockImplementation((url: string) => {
      if (url === "/small-groups/g1/meetings") return Promise.resolve({ data: { id: "meet-1" } });
      if (url === "/small-groups/meetings/meet-1/attendance") return Promise.resolve({ data: {} });
      return Promise.reject(new Error(`unexpected POST ${url}`));
    });

    render(
      <RegisterMeetingModal
        open={true}
        onOpenChange={vi.fn()}
        groupId="g1"
        groupName="Célula Alfa"
        members={members}
        onRegistered={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Registrar e marcar presença" }));
    await screen.findByText("Ana Souza");

    await user.click(screen.getByText("Ana Souza"));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/small-groups/meetings/meet-1/attendance", {
        person_id: "p1",
        present: true,
      })
    );
    expect(await screen.findByText("1/2 presentes")).toBeInTheDocument();
  });

  it("reverts attendance when the API call fails", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockImplementation((url: string) => {
      if (url === "/small-groups/g1/meetings") return Promise.resolve({ data: { id: "meet-1" } });
      if (url === "/small-groups/meetings/meet-1/attendance")
        return Promise.reject(new Error("fail"));
      return Promise.reject(new Error(`unexpected POST ${url}`));
    });

    render(
      <RegisterMeetingModal
        open={true}
        onOpenChange={vi.fn()}
        groupId="g1"
        groupName="Célula Alfa"
        members={members}
        onRegistered={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Registrar e marcar presença" }));
    await screen.findByText("Ana Souza");

    await user.click(screen.getByText("Ana Souza"));

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("0/2 presentes")).toBeInTheDocument();
  });

  it("adds an existing study material to the meeting", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockImplementation((url: string) => {
      if (url === "/small-groups/g1/meetings") return Promise.resolve({ data: { id: "meet-1" } });
      if (url === "/small-groups/meetings/meet-1/materials")
        return Promise.resolve({ data: { id: "link-1" } });
      return Promise.reject(new Error(`unexpected POST ${url}`));
    });
    vi.mocked(api.get).mockResolvedValue({
      data: { data: [{ id: "sm1", title: "Guia de Romanos", author: "Fulano" }] },
    });

    render(
      <RegisterMeetingModal
        open={true}
        onOpenChange={vi.fn()}
        groupId="g1"
        groupName="Célula Alfa"
        members={members}
        onRegistered={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Registrar e marcar presença" }));
    await screen.findByText("Ana Souza");

    await user.type(
      screen.getByPlaceholderText("Buscar material por título…"),
      "Romanos"
    );
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith("/study-materials", {
        params: { search: "Romanos", limit: 8 },
      })
    );

    await user.click(await screen.findByText("Guia de Romanos"));
    await user.click(screen.getByRole("button", { name: "Adicionar material" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/small-groups/meetings/meet-1/materials", {
        material_id: "sm1",
        visibility: "all",
      })
    );
  });

  it("validates required fields when adding an external link material", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({ data: { id: "meet-1" } });

    render(
      <RegisterMeetingModal
        open={true}
        onOpenChange={vi.fn()}
        groupId="g1"
        groupName="Célula Alfa"
        members={members}
        onRegistered={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Registrar e marcar presença" }));
    await screen.findByText("Ana Souza");

    await user.click(screen.getByRole("button", { name: "Informar link externo" }));
    await user.click(screen.getByRole("button", { name: "Adicionar material" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Informe título e link do material."
    );
  });

  it("removes a linked material", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockImplementation((url: string) => {
      if (url === "/small-groups/g1/meetings") return Promise.resolve({ data: { id: "meet-1" } });
      if (url === "/small-groups/meetings/meet-1/materials")
        return Promise.resolve({ data: { id: "link-1" } });
      return Promise.reject(new Error(`unexpected POST ${url}`));
    });
    vi.mocked(api.get).mockResolvedValue({
      data: { data: [{ id: "sm1", title: "Guia de Romanos" }] },
    });
    vi.mocked(api.delete).mockResolvedValue({ data: {} });

    render(
      <RegisterMeetingModal
        open={true}
        onOpenChange={vi.fn()}
        groupId="g1"
        groupName="Célula Alfa"
        members={members}
        onRegistered={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Registrar e marcar presença" }));
    await screen.findByText("Ana Souza");
    await user.type(
      screen.getByPlaceholderText("Buscar material por título…"),
      "Romanos"
    );
    await user.click(await screen.findByText("Guia de Romanos"));
    await user.click(screen.getByRole("button", { name: "Adicionar material" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));

    const removeButton = await screen.findByRole("button", { name: "Remover material" });
    await user.click(removeButton);

    await waitFor(() =>
      expect(api.delete).toHaveBeenCalledWith(
        "/small-groups/meetings/meet-1/materials/sm1"
      )
    );
  });

  it("finishes the flow, calling onRegistered and closing the modal", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({ data: { id: "meet-1" } });
    const onRegistered = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <RegisterMeetingModal
        open={true}
        onOpenChange={onOpenChange}
        groupId="g1"
        groupName="Célula Alfa"
        members={members}
        onRegistered={onRegistered}
      />
    );

    await user.click(screen.getByRole("button", { name: "Registrar e marcar presença" }));
    await screen.findByText("Ana Souza");

    await user.click(screen.getByRole("button", { name: "Finalizar" }));

    expect(onRegistered).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("requires a date when the date field is cleared", async () => {
    const user = userEvent.setup();

    render(
      <RegisterMeetingModal
        open={true}
        onOpenChange={vi.fn()}
        groupId="g1"
        groupName="Célula Alfa"
        members={members}
        onRegistered={vi.fn()}
      />
    );

    const dateInput = screen.getByLabelText(/Data/);
    await user.clear(dateInput);
    await user.click(screen.getByRole("button", { name: "Registrar e marcar presença" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Data é obrigatória.");
    expect(api.post).not.toHaveBeenCalled();
  });

  it("lets the user change the occurred_at date before submitting", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({ data: { id: "meet-1" } });

    render(
      <RegisterMeetingModal
        open={true}
        onOpenChange={vi.fn()}
        groupId="g1"
        groupName="Célula Alfa"
        members={members}
        onRegistered={vi.fn()}
      />
    );

    const dateInput = screen.getByLabelText(/Data/);
    await user.clear(dateInput);
    await user.type(dateInput, "2026-01-15");
    await user.type(screen.getByLabelText(/Observações/), "Reunião especial");
    await user.click(screen.getByRole("button", { name: "Registrar e marcar presença" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/small-groups/g1/meetings",
        expect.objectContaining({
          occurred_at: new Date("2026-01-15T12:00:00").toISOString(),
          observations: "Reunião especial",
        })
      )
    );
  });

  it("cancels the meeting form without submitting", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(
      <RegisterMeetingModal
        open={true}
        onOpenChange={onOpenChange}
        groupId="g1"
        groupName="Célula Alfa"
        members={members}
        onRegistered={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(api.post).not.toHaveBeenCalled();
  });

  it("resets internal state via the Modal's own close (X) button", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(
      <RegisterMeetingModal
        open={true}
        onOpenChange={onOpenChange}
        groupId="g1"
        groupName="Célula Alfa"
        members={members}
        onRegistered={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Fechar" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("clears search results when the search term is emptied", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({ data: { id: "meet-1" } });
    vi.mocked(api.get).mockResolvedValue({
      data: { data: [{ id: "sm1", title: "Guia de Romanos" }] },
    });

    render(
      <RegisterMeetingModal
        open={true}
        onOpenChange={vi.fn()}
        groupId="g1"
        groupName="Célula Alfa"
        members={members}
        onRegistered={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Registrar e marcar presença" }));
    await screen.findByText("Ana Souza");

    const searchInput = screen.getByPlaceholderText("Buscar material por título…");
    await user.type(searchInput, "Romanos");
    await screen.findByText("Guia de Romanos");

    await user.clear(searchInput);
    await waitFor(() =>
      expect(screen.queryByText("Guia de Romanos")).not.toBeInTheDocument()
    );
  });

  it("shows no results when material search fails", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({ data: { id: "meet-1" } });
    vi.mocked(api.get).mockRejectedValue(new Error("search failed"));

    render(
      <RegisterMeetingModal
        open={true}
        onOpenChange={vi.fn()}
        groupId="g1"
        groupName="Célula Alfa"
        members={members}
        onRegistered={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Registrar e marcar presença" }));
    await screen.findByText("Ana Souza");

    await user.type(
      screen.getByPlaceholderText("Buscar material por título…"),
      "Romanos"
    );

    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(screen.queryByText("Guia de Romanos")).not.toBeInTheDocument();
  });

  it("validates that a material is selected in existing mode before adding", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({ data: { id: "meet-1" } });

    render(
      <RegisterMeetingModal
        open={true}
        onOpenChange={vi.fn()}
        groupId="g1"
        groupName="Célula Alfa"
        members={members}
        onRegistered={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Registrar e marcar presença" }));
    await screen.findByText("Ana Souza");

    await user.click(screen.getByRole("button", { name: "Adicionar material" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Selecione um material.");
  });

  it("adds a new material via an external link", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockImplementation((url: string) => {
      if (url === "/small-groups/g1/meetings") return Promise.resolve({ data: { id: "meet-1" } });
      if (url === "/study-materials") return Promise.resolve({ data: { id: "sm-new" } });
      if (url === "/small-groups/meetings/meet-1/materials")
        return Promise.resolve({ data: { id: "link-1" } });
      return Promise.reject(new Error(`unexpected POST ${url}`));
    });

    render(
      <RegisterMeetingModal
        open={true}
        onOpenChange={vi.fn()}
        groupId="g1"
        groupName="Célula Alfa"
        members={members}
        onRegistered={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Registrar e marcar presença" }));
    await screen.findByText("Ana Souza");

    await user.click(screen.getByRole("button", { name: "Informar link externo" }));
    await user.type(screen.getByPlaceholderText("Título do material"), "Artigo externo");
    await user.type(screen.getByPlaceholderText("https://…"), "https://exemplo.com/artigo");

    // Switch visibility to leaders_only and back to all to exercise both radios.
    await user.click(screen.getByLabelText("Somente para líderes"));
    await user.click(screen.getByLabelText("Disponível para todos os membros"));

    await user.click(screen.getByRole("button", { name: "Adicionar material" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/study-materials", expect.objectContaining({
        title: "Artigo externo",
        source_type: "rich_text",
        rich_content: "https://exemplo.com/artigo",
        target_group_ids: ["g1"],
      }))
    );
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/small-groups/meetings/meet-1/materials", {
        material_id: "sm-new",
        visibility: "all",
      })
    );
    expect(await screen.findByText("Artigo externo")).toBeInTheDocument();
  });

  it("switches back to existing-material mode and clears a selected material", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({ data: { id: "meet-1" } });
    vi.mocked(api.get).mockResolvedValue({
      data: { data: [{ id: "sm1", title: "Guia de Romanos" }] },
    });

    render(
      <RegisterMeetingModal
        open={true}
        onOpenChange={vi.fn()}
        groupId="g1"
        groupName="Célula Alfa"
        members={members}
        onRegistered={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Registrar e marcar presença" }));
    await screen.findByText("Ana Souza");

    await user.type(
      screen.getByPlaceholderText("Buscar material por título…"),
      "Romanos"
    );
    await user.click(await screen.findByText("Guia de Romanos"));
    const selectedBox = screen.getByText("Guia de Romanos").closest("div")!
      .parentElement as HTMLElement;
    expect(selectedBox).toBeTruthy();

    // Clear the selected material via its unlabeled "X" button.
    const clearButton = within(selectedBox).getByRole("button");
    await user.click(clearButton);
    expect(screen.queryByText("Guia de Romanos")).not.toBeInTheDocument();

    // Switch to link mode and back to existing mode.
    await user.click(screen.getByRole("button", { name: "Informar link externo" }));
    await user.click(screen.getByRole("button", { name: "Vincular material existente" }));

    expect(screen.getByPlaceholderText("Buscar material por título…")).toBeInTheDocument();
  });

  it("shows a conflict message when the material is already linked (409)", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockImplementation((url: string) => {
      if (url === "/small-groups/g1/meetings") return Promise.resolve({ data: { id: "meet-1" } });
      if (url === "/small-groups/meetings/meet-1/materials") {
        return Promise.reject(Object.assign(new Error("conflict"), { response: { status: 409 } }));
      }
      return Promise.reject(new Error(`unexpected POST ${url}`));
    });
    vi.mocked(api.get).mockResolvedValue({
      data: { data: [{ id: "sm1", title: "Guia de Romanos" }] },
    });

    render(
      <RegisterMeetingModal
        open={true}
        onOpenChange={vi.fn()}
        groupId="g1"
        groupName="Célula Alfa"
        members={members}
        onRegistered={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Registrar e marcar presença" }));
    await screen.findByText("Ana Souza");
    await user.type(
      screen.getByPlaceholderText("Buscar material por título…"),
      "Romanos"
    );
    await user.click(await screen.findByText("Guia de Romanos"));
    await user.click(screen.getByRole("button", { name: "Adicionar material" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Este material já está vinculado a esta reunião."
    );
  });

  it("shows a generic error message when adding a material fails without 409", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockImplementation((url: string) => {
      if (url === "/small-groups/g1/meetings") return Promise.resolve({ data: { id: "meet-1" } });
      if (url === "/small-groups/meetings/meet-1/materials") {
        return Promise.reject(new Error("boom"));
      }
      return Promise.reject(new Error(`unexpected POST ${url}`));
    });
    vi.mocked(api.get).mockResolvedValue({
      data: { data: [{ id: "sm1", title: "Guia de Romanos" }] },
    });

    render(
      <RegisterMeetingModal
        open={true}
        onOpenChange={vi.fn()}
        groupId="g1"
        groupName="Célula Alfa"
        members={members}
        onRegistered={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Registrar e marcar presença" }));
    await screen.findByText("Ana Souza");
    await user.type(
      screen.getByPlaceholderText("Buscar material por título…"),
      "Romanos"
    );
    await user.click(await screen.findByText("Guia de Romanos"));
    await user.click(screen.getByRole("button", { name: "Adicionar material" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Erro ao adicionar material.");
  });

  it("shows an error message when removing a material fails", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockImplementation((url: string) => {
      if (url === "/small-groups/g1/meetings") return Promise.resolve({ data: { id: "meet-1" } });
      if (url === "/small-groups/meetings/meet-1/materials")
        return Promise.resolve({ data: { id: "link-1" } });
      return Promise.reject(new Error(`unexpected POST ${url}`));
    });
    vi.mocked(api.get).mockResolvedValue({
      data: { data: [{ id: "sm1", title: "Guia de Romanos" }] },
    });
    vi.mocked(api.delete).mockRejectedValue(new Error("delete failed"));

    render(
      <RegisterMeetingModal
        open={true}
        onOpenChange={vi.fn()}
        groupId="g1"
        groupName="Célula Alfa"
        members={members}
        onRegistered={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Registrar e marcar presença" }));
    await screen.findByText("Ana Souza");
    await user.type(
      screen.getByPlaceholderText("Buscar material por título…"),
      "Romanos"
    );
    await user.click(await screen.findByText("Guia de Romanos"));
    await user.click(screen.getByRole("button", { name: "Adicionar material" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));

    const removeButton = await screen.findByRole("button", { name: "Remover material" });
    await user.click(removeButton);

    expect(await screen.findByRole("alert")).toHaveTextContent("Erro ao remover material.");
  });

  it("falls back to an empty results list when the search response has no data field", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({ data: { id: "meet-1" } });
    vi.mocked(api.get).mockResolvedValue({ data: {} });

    render(
      <RegisterMeetingModal
        open={true}
        onOpenChange={vi.fn()}
        groupId="g1"
        groupName="Célula Alfa"
        members={members}
        onRegistered={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Registrar e marcar presença" }));
    await screen.findByText("Ana Souza");

    await user.type(
      screen.getByPlaceholderText("Buscar material por título…"),
      "Romanos"
    );

    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(screen.queryByText("Guia de Romanos")).not.toBeInTheDocument();
  });

  it("shows the leaders-only badge for a material added with restricted visibility", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockImplementation((url: string) => {
      if (url === "/small-groups/g1/meetings") return Promise.resolve({ data: { id: "meet-1" } });
      if (url === "/small-groups/meetings/meet-1/materials")
        return Promise.resolve({ data: { id: "link-1" } });
      return Promise.reject(new Error(`unexpected POST ${url}`));
    });
    vi.mocked(api.get).mockResolvedValue({
      data: { data: [{ id: "sm1", title: "Guia de Romanos" }] },
    });

    render(
      <RegisterMeetingModal
        open={true}
        onOpenChange={vi.fn()}
        groupId="g1"
        groupName="Célula Alfa"
        members={members}
        onRegistered={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Registrar e marcar presença" }));
    await screen.findByText("Ana Souza");
    await user.type(
      screen.getByPlaceholderText("Buscar material por título…"),
      "Romanos"
    );
    await user.click(await screen.findByText("Guia de Romanos"));
    await user.click(screen.getByLabelText("Somente para líderes"));
    await user.click(screen.getByRole("button", { name: "Adicionar material" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/small-groups/meetings/meet-1/materials", {
        material_id: "sm1",
        visibility: "leaders_only",
      })
    );
    expect(await screen.findByText("Somente líderes")).toBeInTheDocument();
  });

  it("shows a message when the group has no members", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({ data: { id: "meet-1" } });

    render(
      <RegisterMeetingModal
        open={true}
        onOpenChange={vi.fn()}
        groupId="g1"
        groupName="Célula Alfa"
        members={[]}
        onRegistered={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Registrar e marcar presença" }));

    expect(
      await screen.findByText("Nenhum membro cadastrado neste grupo.")
    ).toBeInTheDocument();
  });
});
