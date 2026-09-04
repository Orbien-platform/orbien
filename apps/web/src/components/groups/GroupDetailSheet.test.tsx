import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GroupDetailSheet } from "./GroupDetailSheet";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), patch: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

function findSelectByOptionText(text: string): HTMLSelectElement {
  const select = Array.from(document.body.querySelectorAll("select")).find((el) =>
    el.textContent?.includes(text)
  );
  if (!select) throw new Error(`No <select> found containing option "${text}"`);
  return select as HTMLSelectElement;
}

const group = {
  id: "g1",
  name: "Célula Alfa",
  groupType: { id: "gt1", name: "Célula", color: "#111111" },
  meeting_time: "Segunda-feira 19:00",
  address: "Rua A, 100",
  public_description: "Descrição do grupo",
  leader: { id: "p1", full_name: "Ana Souza" },
  memberships: [
    { id: "m1", role: "member", person: { id: "p2", full_name: "Bruno Lima" } },
  ],
  _count: { memberships: 1 },
};

const meetings = [
  { id: "mtg1", occurred_at: "2026-08-01T12:00:00.000Z", topic: "Estudo", _count: { attendanceRecords: 3 } },
];

function mockGet() {
  vi.mocked(api.get).mockImplementation((url: string) => {
    if (url === "/small-groups/g1") {
      return Promise.resolve({ data: group });
    }
    if (url.startsWith("/small-groups/g1/meetings")) {
      return Promise.resolve({ data: { data: meetings } });
    }
    if (url.startsWith("/small-groups/meetings/")) {
      return Promise.resolve({ data: { data: [] } });
    }
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
}

describe("GroupDetailSheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet();
  });

  it("does not render content when closed", () => {
    render(
      <GroupDetailSheet
        open={false}
        onOpenChange={vi.fn()}
        groupId="g1"
        onUpdated={vi.fn()}
        canEdit={true}
      />
    );
    expect(screen.queryByText("Célula Alfa")).not.toBeInTheDocument();
  });

  it("loads and displays group details when opened", async () => {
    render(
      <GroupDetailSheet
        open={true}
        onOpenChange={vi.fn()}
        groupId="g1"
        onUpdated={vi.fn()}
        canEdit={true}
      />
    );

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/small-groups/g1"));
    expect(await screen.findByText("Célula Alfa")).toBeInTheDocument();
    expect(screen.getByText("Célula")).toBeInTheDocument();
    expect(screen.getByText("Ana Souza")).toBeInTheDocument();
    expect(screen.getByText("Segunda-feira 19:00")).toBeInTheDocument();
    expect(screen.getByText("Rua A, 100")).toBeInTheDocument();
    expect(screen.getByText("Descrição do grupo")).toBeInTheDocument();
  });

  it("shows members and meetings on the respective tabs", async () => {
    const user = userEvent.setup();
    render(
      <GroupDetailSheet
        open={true}
        onOpenChange={vi.fn()}
        groupId="g1"
        onUpdated={vi.fn()}
        canEdit={true}
      />
    );

    expect(await screen.findByText("Célula Alfa")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /Membros/ }));
    expect(await screen.findByText("Bruno Lima")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Reuniões" }));
    expect(await screen.findByText("Estudo")).toBeInTheDocument();
    expect(screen.getByText("3 presentes")).toBeInTheDocument();
  });

  it("validates required name field and saves edits", async () => {
    const user = userEvent.setup();
    const onUpdated = vi.fn();
    vi.mocked(api.patch).mockResolvedValue({ data: { ...group, name: "Célula Beta" } });

    render(
      <GroupDetailSheet
        open={true}
        onOpenChange={vi.fn()}
        groupId="g1"
        onUpdated={onUpdated}
        canEdit={true}
      />
    );

    expect(await screen.findByText("Célula Alfa")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Editar" }));

    const nameInput = screen.getByDisplayValue("Célula Alfa");
    await user.clear(nameInput);
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText("Nome é obrigatório.")).toBeInTheDocument();
    expect(api.patch).not.toHaveBeenCalled();

    await user.type(nameInput, "Célula Beta");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(
        "/small-groups/g1",
        expect.objectContaining({ name: "Célula Beta" })
      )
    );
    expect(await screen.findByText("Célula Beta")).toBeInTheDocument();
    expect(onUpdated).toHaveBeenCalled();
  });

  it("shows an error message when saving edits fails", async () => {
    const user = userEvent.setup();
    vi.mocked(api.patch).mockRejectedValue(new Error("fail"));

    render(
      <GroupDetailSheet
        open={true}
        onOpenChange={vi.fn()}
        groupId="g1"
        onUpdated={vi.fn()}
        canEdit={true}
      />
    );

    expect(await screen.findByText("Célula Alfa")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Editar" }));
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText("Erro ao salvar alterações.")).toBeInTheDocument();
  });

  it("does not show the edit button when canEdit is false", async () => {
    render(
      <GroupDetailSheet
        open={true}
        onOpenChange={vi.fn()}
        groupId="g1"
        onUpdated={vi.fn()}
        canEdit={false}
      />
    );

    expect(await screen.findByText("Célula Alfa")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Editar" })).not.toBeInTheDocument();
  });

  it("cancels editing without saving", async () => {
    const user = userEvent.setup();
    render(
      <GroupDetailSheet
        open={true}
        onOpenChange={vi.fn()}
        groupId="g1"
        onUpdated={vi.fn()}
        canEdit={true}
      />
    );

    expect(await screen.findByText("Célula Alfa")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Editar" }));
    expect(screen.getByDisplayValue("Célula Alfa")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByDisplayValue("Célula Alfa")).not.toBeInTheDocument();
    expect(screen.getByText("Célula Alfa")).toBeInTheDocument();
    expect(api.patch).not.toHaveBeenCalled();
  });

  it("shows the empty state and blank meeting-time fields for a group with no extra info", async () => {
    const user = userEvent.setup();
    const bareGroup = {
      id: "g1",
      name: "Grupo Simples",
      groupType: { id: "gt1", name: "Célula", color: null },
      memberships: [],
    };
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/small-groups/g1") return Promise.resolve({ data: bareGroup });
      if (url.startsWith("/small-groups/g1/meetings"))
        return Promise.resolve({ data: { data: [] } });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });

    render(
      <GroupDetailSheet
        open={true}
        onOpenChange={vi.fn()}
        groupId="g1"
        onUpdated={vi.fn()}
        canEdit={true}
      />
    );

    expect(await screen.findByText("Grupo Simples")).toBeInTheDocument();
    expect(screen.getByText("Nenhuma informação adicional.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Editar" }));
    const daySelect = findSelectByOptionText("Segunda-feira");
    expect(daySelect).toHaveValue("");
    const timeInput = document.querySelector('input[type="time"]') as HTMLInputElement;
    expect(timeInput.value).toBe("");
  });

  it("saves a meeting_time built from the day only", async () => {
    const user = userEvent.setup();
    vi.mocked(api.patch).mockResolvedValue({ data: { ...group, meeting_time: "Terça-feira" } });

    render(
      <GroupDetailSheet
        open={true}
        onOpenChange={vi.fn()}
        groupId="g1"
        onUpdated={vi.fn()}
        canEdit={true}
      />
    );

    expect(await screen.findByText("Célula Alfa")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Editar" }));

    const timeInput = document.querySelector('input[type="time"]') as HTMLInputElement;
    await user.clear(timeInput);
    const daySelect = findSelectByOptionText("Terça-feira");
    await user.selectOptions(daySelect, "Terça-feira");

    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(
        "/small-groups/g1",
        expect.objectContaining({ meeting_time: "Terça-feira" })
      )
    );
  });

  it("saves a meeting_time built from the time only, and edits address/description", async () => {
    const user = userEvent.setup();
    vi.mocked(api.patch).mockResolvedValue({ data: group });

    render(
      <GroupDetailSheet
        open={true}
        onOpenChange={vi.fn()}
        groupId="g1"
        onUpdated={vi.fn()}
        canEdit={true}
      />
    );

    expect(await screen.findByText("Célula Alfa")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Editar" }));

    const daySelect = findSelectByOptionText("Terça-feira");
    await user.selectOptions(daySelect, "");

    const addressInput = screen.getByDisplayValue("Rua A, 100");
    await user.clear(addressInput);
    await user.type(addressInput, "Rua Nova, 200");

    const descTextarea = screen.getByDisplayValue("Descrição do grupo");
    await user.clear(descTextarea);
    await user.type(descTextarea, "Nova descrição");

    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(
        "/small-groups/g1",
        expect.objectContaining({
          meeting_time: "19:00",
          address: "Rua Nova, 200",
          public_description: "Nova descrição",
        })
      )
    );
  });

  it("resets state when the sheet is closed via its close button", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(
      <GroupDetailSheet
        open={true}
        onOpenChange={onOpenChange}
        groupId="g1"
        onUpdated={vi.fn()}
        canEdit={true}
      />
    );

    expect(await screen.findByText("Célula Alfa")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("falls back to an empty meetings list when the meetings request fails", async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/small-groups/g1") return Promise.resolve({ data: group });
      if (url.startsWith("/small-groups/g1/meetings"))
        return Promise.reject(new Error("meetings down"));
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    const user = userEvent.setup();

    render(
      <GroupDetailSheet
        open={true}
        onOpenChange={vi.fn()}
        groupId="g1"
        onUpdated={vi.fn()}
        canEdit={true}
      />
    );

    expect(await screen.findByText("Célula Alfa")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Reuniões" }));
    expect(await screen.findByText("Nenhuma reunião registrada.")).toBeInTheDocument();
  });

  it("does not update state after the sheet closes before the request resolves", async () => {
    let resolveGroup: (v: unknown) => void = () => {};
    const pending = new Promise((resolve) => {
      resolveGroup = resolve;
    });
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/small-groups/g1") return pending as Promise<{ data: typeof group }>;
      if (url.startsWith("/small-groups/g1/meetings"))
        return Promise.resolve({ data: { data: [] } });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });

    const { unmount } = render(
      <GroupDetailSheet
        open={true}
        onOpenChange={vi.fn()}
        groupId="g1"
        onUpdated={vi.fn()}
        canEdit={true}
      />
    );

    // Unmount (effect cleanup marks the in-flight request cancelled) before
    // the group request resolves.
    unmount();
    resolveGroup({ data: group });

    // No crash / no "not wrapped in act" state update from the stale response.
    await waitFor(() => expect(api.get).toHaveBeenCalled());
  });

  it("expands a meeting, fetches its materials, and collapses it again", async () => {
    const materials = [
      {
        id: "mm1",
        material_id: "sm1",
        visibility: "all",
        material: { id: "sm1", title: "Guia de Romanos", source_type: "rich_text", rich_content: "https://exemplo.com/guia" },
      },
      {
        id: "mm2",
        material_id: "sm2",
        visibility: "leaders_only",
        material: { id: "sm2", title: "Nota interna", source_type: "link" },
      },
      {
        id: "mm3",
        material_id: "sm3",
        visibility: "leaders_only",
        material: { id: "sm3", title: "Texto solto", source_type: "rich_text", rich_content: "não é uma url" },
      },
    ];
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/small-groups/g1") return Promise.resolve({ data: group });
      if (url.startsWith("/small-groups/g1/meetings"))
        return Promise.resolve({ data: { data: meetings } });
      if (url === "/small-groups/meetings/mtg1/materials")
        return Promise.resolve({ data: { data: materials } });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    const user = userEvent.setup();

    render(
      <GroupDetailSheet
        open={true}
        onOpenChange={vi.fn()}
        groupId="g1"
        onUpdated={vi.fn()}
        canEdit={true}
      />
    );

    expect(await screen.findByText("Célula Alfa")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Reuniões" }));
    expect(await screen.findByText("Estudo")).toBeInTheDocument();

    await user.click(screen.getByText("Estudo"));

    expect(await screen.findByText("Guia de Romanos")).toBeInTheDocument();
    expect(screen.getByText("Nota interna")).toBeInTheDocument();
    expect(screen.getByText("Todos")).toBeInTheDocument();
    expect(screen.getAllByText("Somente líderes").length).toBe(2);
    // Valid https URL renders as a link.
    expect(screen.getByRole("link", { name: "Guia de Romanos" })).toHaveAttribute(
      "href",
      "https://exemplo.com/guia"
    );
    // No rich_content -> plain text, not a link.
    expect(screen.queryByRole("link", { name: "Nota interna" })).not.toBeInTheDocument();
    // rich_content that isn't a valid URL -> plain text, not a link.
    expect(screen.getByText("Texto solto")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Texto solto" })).not.toBeInTheDocument();

    // Re-clicking the same meeting collapses it (no extra material fetch).
    await user.click(screen.getByText("Estudo"));
    expect(screen.queryByText("Guia de Romanos")).not.toBeInTheDocument();
    const materialsCallCount = vi.mocked(api.get).mock.calls.filter(
      (c) => c[0] === "/small-groups/meetings/mtg1/materials"
    ).length;

    // Expanding again reuses the cached materials (no new fetch).
    await user.click(screen.getByText("Estudo"));
    expect(await screen.findByText("Guia de Romanos")).toBeInTheDocument();
    expect(
      vi.mocked(api.get).mock.calls.filter(
        (c) => c[0] === "/small-groups/meetings/mtg1/materials"
      ).length
    ).toBe(materialsCallCount);
  });

  it("shows an empty materials state when a meeting has none, and hides the remove button when canEdit is false", async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/small-groups/g1") return Promise.resolve({ data: group });
      if (url.startsWith("/small-groups/g1/meetings"))
        return Promise.resolve({ data: { data: meetings } });
      if (url === "/small-groups/meetings/mtg1/materials")
        return Promise.resolve({ data: { data: [] } });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    const user = userEvent.setup();

    render(
      <GroupDetailSheet
        open={true}
        onOpenChange={vi.fn()}
        groupId="g1"
        onUpdated={vi.fn()}
        canEdit={false}
      />
    );

    expect(await screen.findByText("Célula Alfa")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Reuniões" }));
    expect(await screen.findByText("Estudo")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Registrar reunião" })
    ).not.toBeInTheDocument();

    await user.click(screen.getByText("Estudo"));
    expect(await screen.findByText("Nenhum material vinculado.")).toBeInTheDocument();
  });

  it("falls back to an empty materials list when fetching materials fails", async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/small-groups/g1") return Promise.resolve({ data: group });
      if (url.startsWith("/small-groups/g1/meetings"))
        return Promise.resolve({ data: { data: meetings } });
      if (url === "/small-groups/meetings/mtg1/materials")
        return Promise.reject(new Error("materials down"));
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    const user = userEvent.setup();

    render(
      <GroupDetailSheet
        open={true}
        onOpenChange={vi.fn()}
        groupId="g1"
        onUpdated={vi.fn()}
        canEdit={true}
      />
    );

    expect(await screen.findByText("Célula Alfa")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Reuniões" }));
    expect(await screen.findByText("Estudo")).toBeInTheDocument();

    await user.click(screen.getByText("Estudo"));
    expect(await screen.findByText("Nenhum material vinculado.")).toBeInTheDocument();
  });

  it("removes a linked material after confirmation", async () => {
    const materials = [
      {
        id: "mm1",
        material_id: "sm1",
        visibility: "all",
        material: { id: "sm1", title: "Guia de Romanos" },
      },
    ];
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/small-groups/g1") return Promise.resolve({ data: group });
      if (url.startsWith("/small-groups/g1/meetings"))
        return Promise.resolve({ data: { data: meetings } });
      if (url === "/small-groups/meetings/mtg1/materials")
        return Promise.resolve({ data: { data: materials } });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    vi.mocked(api.delete).mockResolvedValue({ data: {} });
    const user = userEvent.setup();

    render(
      <GroupDetailSheet
        open={true}
        onOpenChange={vi.fn()}
        groupId="g1"
        onUpdated={vi.fn()}
        canEdit={true}
      />
    );

    expect(await screen.findByText("Célula Alfa")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Reuniões" }));
    await user.click(await screen.findByText("Estudo"));
    expect(await screen.findByText("Guia de Romanos")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remover material" }));
    const confirmDialog = await screen.findByRole("dialog", { name: "Remover material?" });
    await user.click(within(confirmDialog).getByRole("button", { name: "Remover" }));

    await waitFor(() =>
      expect(api.delete).toHaveBeenCalledWith(
        "/small-groups/meetings/mtg1/materials/sm1"
      )
    );
    expect(screen.queryByText("Guia de Romanos")).not.toBeInTheDocument();
  });

  it("cancels the material removal confirmation without deleting", async () => {
    const materials = [
      {
        id: "mm1",
        material_id: "sm1",
        visibility: "all",
        material: { id: "sm1", title: "Guia de Romanos" },
      },
    ];
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/small-groups/g1") return Promise.resolve({ data: group });
      if (url.startsWith("/small-groups/g1/meetings"))
        return Promise.resolve({ data: { data: meetings } });
      if (url === "/small-groups/meetings/mtg1/materials")
        return Promise.resolve({ data: { data: materials } });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    const user = userEvent.setup();

    render(
      <GroupDetailSheet
        open={true}
        onOpenChange={vi.fn()}
        groupId="g1"
        onUpdated={vi.fn()}
        canEdit={true}
      />
    );

    expect(await screen.findByText("Célula Alfa")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Reuniões" }));
    await user.click(await screen.findByText("Estudo"));
    expect(await screen.findByText("Guia de Romanos")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remover material" }));
    const confirmDialog = await screen.findByRole("dialog", { name: "Remover material?" });
    await user.click(within(confirmDialog).getByRole("button", { name: "Cancelar" }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Remover material?" })).not.toBeInTheDocument()
    );
    expect(api.delete).not.toHaveBeenCalled();
    expect(screen.getByText("Guia de Romanos")).toBeInTheDocument();
  });

  it("closes the material removal confirmation via backdrop click", async () => {
    const materials = [
      {
        id: "mm1",
        material_id: "sm1",
        visibility: "all",
        material: { id: "sm1", title: "Guia de Romanos" },
      },
    ];
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/small-groups/g1") return Promise.resolve({ data: group });
      if (url.startsWith("/small-groups/g1/meetings"))
        return Promise.resolve({ data: { data: meetings } });
      if (url === "/small-groups/meetings/mtg1/materials")
        return Promise.resolve({ data: { data: materials } });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    const user = userEvent.setup();

    render(
      <GroupDetailSheet
        open={true}
        onOpenChange={vi.fn()}
        groupId="g1"
        onUpdated={vi.fn()}
        canEdit={true}
      />
    );

    expect(await screen.findByText("Célula Alfa")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Reuniões" }));
    await user.click(await screen.findByText("Estudo"));
    expect(await screen.findByText("Guia de Romanos")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remover material" }));
    await screen.findByRole("dialog", { name: "Remover material?" });

    const backdrop = document.querySelector(".bg-black\\/40") as HTMLElement;
    expect(backdrop).toBeTruthy();
    await user.click(backdrop);

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Remover material?" })).not.toBeInTheDocument()
    );
  });

  it("opens the register-meeting modal and refreshes the meetings list on completion", async () => {
    let meetingsCallCount = 0;
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/small-groups/g1") return Promise.resolve({ data: group });
      if (url.startsWith("/small-groups/g1/meetings")) {
        meetingsCallCount += 1;
        return Promise.resolve({ data: { data: meetings } });
      }
      if (url.startsWith("/small-groups/meetings/"))
        return Promise.resolve({ data: { data: [] } });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    vi.mocked(api.post).mockResolvedValue({ data: { id: "meet-new" } });
    const user = userEvent.setup();

    render(
      <GroupDetailSheet
        open={true}
        onOpenChange={vi.fn()}
        groupId="g1"
        onUpdated={vi.fn()}
        canEdit={true}
      />
    );

    expect(await screen.findByText("Célula Alfa")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Reuniões" }));
    await user.click(await screen.findByRole("button", { name: "Registrar reunião" }));

    expect(await screen.findByRole("heading", { name: "Registrar reunião" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Registrar e marcar presença" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/small-groups/g1/meetings",
        expect.anything()
      )
    );
    await user.click(screen.getByRole("button", { name: "Finalizar" }));

    await waitFor(() => expect(meetingsCallCount).toBeGreaterThan(1));
  });
});
