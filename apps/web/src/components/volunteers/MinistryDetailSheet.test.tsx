import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MinistryDetailSheet } from "./MinistryDetailSheet";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const tree = [
  {
    id: "mn1",
    name: "Louvor",
    color: "#123456",
    children: [{ id: "mn1a", name: "Coral", color: null, children: [] }],
  },
];

const ministry = {
  id: "mn1",
  name: "Louvor",
  description: "Ministério de música",
  color: "#123456",
  parent_ministry_id: null,
  leaders: [
    {
      id: "as1",
      role: "leader" as const,
      is_primary_leader: true,
      volunteerProfile: { id: "vp1", person: { id: "p1", full_name: "Ana Souza", classification: "member" } },
    },
    {
      id: "as2",
      role: "leader" as const,
      is_primary_leader: false,
      volunteerProfile: { id: "vp2", person: { id: "p2", full_name: "Bruno Lima", classification: "member" } },
    },
  ],
  volunteers: [
    {
      id: "as3",
      role: "volunteer" as const,
      is_primary_leader: false,
      volunteerProfile: { id: "vp3", person: { id: "p3", full_name: "Carla Dias", classification: "attendee" } },
    },
  ],
};

function mockGet() {
  vi.mocked(api.get).mockImplementation((url: string) => {
    if (url === "/volunteers/ministries/mn1") return Promise.resolve({ data: ministry });
    if (url === "/volunteers/profiles") return Promise.resolve({ data: [] });
    if (url.startsWith("/persons?")) {
      return Promise.resolve({
        data: { data: [{ id: "p4", full_name: "Diego Alves", classification: "member" }] },
      });
    }
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
}

const baseProps = {
  onOpenChange: vi.fn(),
  ministryId: "mn1",
  canEdit: true,
  tree,
  onUpdated: vi.fn(),
  onSelectMinistry: vi.fn(),
};

describe("MinistryDetailSheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not render content when closed", () => {
    mockGet();
    render(<MinistryDetailSheet open={false} {...baseProps} />);
    expect(screen.queryByText("Louvor")).not.toBeInTheDocument();
  });

  it("loads and displays leaders, volunteers and sub-ministries", async () => {
    mockGet();
    render(<MinistryDetailSheet open={true} {...baseProps} />);

    expect(await screen.findByText("Louvor")).toBeInTheDocument();
    expect(screen.getByText("Líderes (2)")).toBeInTheDocument();
    expect(screen.getByText("Ana Souza")).toBeInTheDocument();
    expect(screen.getByText("Principal")).toBeInTheDocument();
    expect(screen.getByText("Voluntários (1)")).toBeInTheDocument();
    expect(screen.getByText("Carla Dias")).toBeInTheDocument();
    expect(screen.getByText("Sub-ministérios (1)")).toBeInTheDocument();
    expect(screen.getByText("Coral")).toBeInTheDocument();
  });

  it("selects a sub-ministry when clicked", async () => {
    mockGet();
    const onSelectMinistry = vi.fn();
    const user = userEvent.setup();
    render(<MinistryDetailSheet open={true} {...baseProps} onSelectMinistry={onSelectMinistry} />);

    await user.click(await screen.findByText("Coral"));
    expect(onSelectMinistry).toHaveBeenCalledWith("mn1a");
  });

  it("edits the ministry name, description and color", async () => {
    mockGet();
    vi.mocked(api.patch).mockResolvedValue({ data: { name: "Louvor e Adoração" } });
    const onUpdated = vi.fn();
    const user = userEvent.setup();

    render(<MinistryDetailSheet open={true} {...baseProps} onUpdated={onUpdated} />);
    await screen.findByText("Louvor");

    await user.click(screen.getByRole("button", { name: /Editar/ }));
    const nameInput = screen.getByDisplayValue("Louvor");
    await user.clear(nameInput);
    await user.type(nameInput, "Louvor e Adoração");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(
        "/volunteers/ministries/mn1",
        expect.objectContaining({ name: "Louvor e Adoração" })
      )
    );
    expect(onUpdated).toHaveBeenCalled();
  });

  it("shows an error message when saving the edit fails", async () => {
    mockGet();
    vi.mocked(api.patch).mockRejectedValue(new Error("fail"));
    const user = userEvent.setup();

    render(<MinistryDetailSheet open={true} {...baseProps} />);
    await screen.findByText("Louvor");
    await user.click(screen.getByRole("button", { name: /Editar/ }));
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText("Erro ao salvar.")).toBeInTheDocument();
  });

  it("makes a leader the primary leader", async () => {
    mockGet();
    vi.mocked(api.patch).mockResolvedValue({ data: {} });
    const onUpdated = vi.fn();
    const user = userEvent.setup();

    render(<MinistryDetailSheet open={true} {...baseProps} onUpdated={onUpdated} />);
    await screen.findByText("Bruno Lima");

    await user.click(screen.getByRole("button", { name: "Tornar principal" }));

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith("/volunteers/ministry-assignments/as2", {
        is_primary_leader: true,
      })
    );
    expect(await screen.findByText("Líder principal atualizado.")).toBeInTheDocument();
    expect(onUpdated).toHaveBeenCalled();
  });

  it("removes a member after confirmation", async () => {
    mockGet();
    vi.mocked(api.delete).mockResolvedValue({ data: {} });
    const onUpdated = vi.fn();
    const user = userEvent.setup();

    render(<MinistryDetailSheet open={true} {...baseProps} onUpdated={onUpdated} />);
    await screen.findByText("Carla Dias");

    const removeButtons = screen.getAllByRole("button", { name: "Remover" });
    await user.click(removeButtons[removeButtons.length - 1]);

    expect(await screen.findByText("Remover do ministério?")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Remover" }).slice(-1)[0]);

    await waitFor(() =>
      expect(api.delete).toHaveBeenCalledWith("/volunteers/ministry-assignments/as3")
    );
    expect(await screen.findByText("Pessoa removida do ministério.")).toBeInTheDocument();
    expect(onUpdated).toHaveBeenCalled();
  });

  it("does not show edit controls when canEdit is false", async () => {
    mockGet();
    render(<MinistryDetailSheet open={true} {...baseProps} canEdit={false} />);
    await screen.findByText("Louvor");

    expect(screen.queryByRole("button", { name: /Editar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Adicionar pessoa" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remover" })).not.toBeInTheDocument();
  });

  it("adds a new person, searching, selecting, and submitting", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockGet();
    vi.mocked(api.post).mockImplementation((url: string) => {
      if (url === "/volunteers/profiles") return Promise.resolve({ data: { id: "vp4" } });
      if (url === "/volunteers/ministry-assignments") return Promise.resolve({ data: {} });
      return Promise.reject(new Error(`unexpected POST ${url}`));
    });
    const onUpdated = vi.fn();
    const user = userEvent.setup();

    render(<MinistryDetailSheet open={true} {...baseProps} onUpdated={onUpdated} />);
    await screen.findByText("Louvor");

    await user.click(screen.getByRole("button", { name: "Adicionar pessoa" }));
    await screen.findByRole("heading", { name: "Adicionar pessoa" });

    await user.type(screen.getByPlaceholderText("Buscar pelo nome…"), "Diego");
    await vi.advanceTimersByTimeAsync(300);

    expect(await screen.findByText("Diego Alves")).toBeInTheDocument();
    await user.click(screen.getByText("Diego Alves"));

    await user.click(screen.getByRole("button", { name: "Adicionar" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/volunteers/profiles", {
        person_id: "p4",
        availability: {},
      })
    );
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/volunteers/ministry-assignments", {
        volunteer_profile_id: "vp4",
        ministry_id: "mn1",
        role: "volunteer",
      })
    );
    expect(onUpdated).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("requires a person before submitting the add-member form", async () => {
    mockGet();
    const user = userEvent.setup();
    render(<MinistryDetailSheet open={true} {...baseProps} />);
    await screen.findByText("Louvor");

    await user.click(screen.getByRole("button", { name: "Adicionar pessoa" }));
    await screen.findByRole("heading", { name: "Adicionar pessoa" });
    await user.click(screen.getByRole("button", { name: "Adicionar" }));

    expect(await screen.findByText("Selecione uma pessoa.")).toBeInTheDocument();
  });

  it("shows the API's error message when saving the edit fails with a server message", async () => {
    mockGet();
    vi.mocked(api.patch).mockRejectedValue({
      isAxiosError: true,
      response: { data: { message: "Nome já em uso." } },
    });
    const user = userEvent.setup();

    render(<MinistryDetailSheet open={true} {...baseProps} />);
    await screen.findByText("Louvor");
    await user.click(screen.getByRole("button", { name: /Editar/ }));
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText("Nome já em uso.")).toBeInTheDocument();
  });

  it("shows a fallback message when loading the ministry detail fails", async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/volunteers/ministries/mn1") return Promise.reject(new Error("boom"));
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    render(<MinistryDetailSheet open={true} {...baseProps} />);

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/volunteers/ministries/mn1"));
    expect(screen.queryByText("Louvor")).not.toBeInTheDocument();
  });

  it("ignores a ministry detail response that resolves after the sheet unmounted", async () => {
    let resolveGet!: (v: { data: typeof ministry }) => void;
    vi.mocked(api.get).mockReturnValue(
      new Promise((resolve) => {
        resolveGet = resolve;
      }) as ReturnType<typeof api.get>
    );
    const { unmount } = render(<MinistryDetailSheet open={true} {...baseProps} />);
    unmount();

    resolveGet({ data: ministry });
    await Promise.resolve();
    await Promise.resolve();
  });

  it("closes the sheet via its close button, resetting state on the next open", async () => {
    mockGet();
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    render(<MinistryDetailSheet open={true} {...baseProps} onOpenChange={onOpenChange} />);
    await screen.findByText("Louvor");

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("cancels editing without saving changes", async () => {
    mockGet();
    const user = userEvent.setup();

    render(<MinistryDetailSheet open={true} {...baseProps} />);
    await screen.findByText("Louvor");

    await user.click(screen.getByRole("button", { name: /Editar/ }));
    const descTextarea = screen.getByDisplayValue("Ministério de música");
    await user.type(descTextarea, " extra");
    const tealButton = document.querySelector('button[style*="13, 148, 136"]') as HTMLButtonElement;
    await user.click(tealButton);
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByRole("button", { name: "Salvar" })).not.toBeInTheDocument();
    expect(api.patch).not.toHaveBeenCalled();
  });

  it("removes a leader after confirmation", async () => {
    mockGet();
    vi.mocked(api.delete).mockResolvedValue({ data: {} });
    const user = userEvent.setup();

    render(<MinistryDetailSheet open={true} {...baseProps} />);
    await screen.findByText("Ana Souza");

    const removeButtons = screen.getAllByRole("button", { name: "Remover" });
    await user.click(removeButtons[0]);

    expect(await screen.findByText("Remover do ministério?")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Remover" }).slice(-1)[0]);

    await waitFor(() =>
      expect(api.delete).toHaveBeenCalledWith("/volunteers/ministry-assignments/as1")
    );
  });

  it("cancels the remove confirmation without deleting", async () => {
    mockGet();
    const user = userEvent.setup();

    render(<MinistryDetailSheet open={true} {...baseProps} />);
    await screen.findByText("Carla Dias");

    const removeButtons = screen.getAllByRole("button", { name: "Remover" });
    await user.click(removeButtons[removeButtons.length - 1]);
    expect(await screen.findByText("Remover do ministério?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByText("Remover do ministério?")).not.toBeInTheDocument();
    expect(api.delete).not.toHaveBeenCalled();
  });

  it("closes the remove confirmation via its close button", async () => {
    mockGet();
    const user = userEvent.setup();

    render(<MinistryDetailSheet open={true} {...baseProps} />);
    await screen.findByText("Carla Dias");

    const removeButtons = screen.getAllByRole("button", { name: "Remover" });
    await user.click(removeButtons[removeButtons.length - 1]);
    await screen.findByText("Remover do ministério?");

    await user.click(screen.getByRole("button", { name: "Fechar" }));
    expect(screen.queryByText("Remover do ministério?")).not.toBeInTheDocument();
    expect(api.delete).not.toHaveBeenCalled();
  });

  it("auto-dismisses the toast after making a leader primary", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockGet();
    vi.mocked(api.patch).mockResolvedValue({ data: {} });
    const user = userEvent.setup();

    render(<MinistryDetailSheet open={true} {...baseProps} />);
    await screen.findByText("Bruno Lima");
    await user.click(screen.getByRole("button", { name: "Tornar principal" }));

    expect(await screen.findByText("Líder principal atualizado.")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(screen.queryByText("Líder principal atualizado.")).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it("loads existing volunteer profiles, reusing them instead of creating new ones", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/volunteers/ministries/mn1") return Promise.resolve({ data: ministry });
      if (url === "/volunteers/profiles") return Promise.resolve({ data: [{ id: "vp4", person_id: "p4" }] });
      if (url.startsWith("/persons?")) {
        return Promise.resolve({
          data: { data: [{ id: "p4", full_name: "Diego Alves", classification: "member" }] },
        });
      }
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    vi.mocked(api.post).mockImplementation((url: string) => {
      if (url === "/volunteers/ministry-assignments") return Promise.resolve({ data: {} });
      return Promise.reject(new Error(`unexpected POST ${url}`));
    });
    const user = userEvent.setup();

    render(<MinistryDetailSheet open={true} {...baseProps} />);
    await screen.findByText("Louvor");
    await user.click(screen.getByRole("button", { name: "Adicionar pessoa" }));
    await screen.findByRole("heading", { name: "Adicionar pessoa" });

    await user.type(screen.getByPlaceholderText("Buscar pelo nome…"), "Diego");
    await vi.advanceTimersByTimeAsync(300);
    await user.click(await screen.findByText("Diego Alves"));
    await user.click(screen.getByRole("button", { name: "Adicionar" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/volunteers/ministry-assignments", {
        volunteer_profile_id: "vp4",
        ministry_id: "mn1",
        role: "volunteer",
      })
    );
    expect(api.post).not.toHaveBeenCalledWith("/volunteers/profiles", expect.anything());
    vi.useRealTimers();
  });

  it("searches for a leader, applying the member-only classification filter", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockGet();
    const user = userEvent.setup();

    render(<MinistryDetailSheet open={true} {...baseProps} />);
    await screen.findByText("Louvor");
    await user.click(screen.getByRole("button", { name: "Adicionar pessoa" }));
    await screen.findByRole("heading", { name: "Adicionar pessoa" });

    await user.selectOptions(screen.getByDisplayValue("Voluntário"), "leader");
    expect(
      screen.getByText("Apenas membros podem ser líderes — mostrando só membros.")
    ).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("Buscar pelo nome…"), "Diego");
    await vi.advanceTimersByTimeAsync(300);
    expect(await screen.findByText("Diego Alves")).toBeInTheDocument();

    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(
        expect.stringContaining("classification=member")
      )
    );

    // Select the person, mark as primary leader, and submit.
    await user.click(screen.getByText("Diego Alves"));
    await user.click(screen.getByRole("checkbox", { name: /Marcar como líder principal/ }));
    vi.mocked(api.post).mockImplementation((url: string) => {
      if (url === "/volunteers/profiles") return Promise.resolve({ data: { id: "vp4" } });
      if (url === "/volunteers/ministry-assignments") return Promise.resolve({ data: {} });
      return Promise.reject(new Error(`unexpected POST ${url}`));
    });
    await user.click(screen.getByRole("button", { name: "Adicionar" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/volunteers/ministry-assignments", {
        volunteer_profile_id: "vp4",
        ministry_id: "mn1",
        role: "leader",
        is_primary_leader: true,
      })
    );
    vi.useRealTimers();
  });

  it("shows no results when the search request fails", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/volunteers/ministries/mn1") return Promise.resolve({ data: ministry });
      if (url === "/volunteers/profiles") return Promise.resolve({ data: [] });
      if (url.startsWith("/persons?")) return Promise.reject(new Error("search failed"));
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    const user = userEvent.setup();

    render(<MinistryDetailSheet open={true} {...baseProps} />);
    await screen.findByText("Louvor");
    await user.click(screen.getByRole("button", { name: "Adicionar pessoa" }));
    await screen.findByRole("heading", { name: "Adicionar pessoa" });

    await user.type(screen.getByPlaceholderText("Buscar pelo nome…"), "Diego");
    await vi.advanceTimersByTimeAsync(300);

    expect(await screen.findByText("Nenhuma pessoa encontrada.")).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("clears the search results when the query is emptied", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockGet();
    const user = userEvent.setup();

    render(<MinistryDetailSheet open={true} {...baseProps} />);
    await screen.findByText("Louvor");
    await user.click(screen.getByRole("button", { name: "Adicionar pessoa" }));
    await screen.findByRole("heading", { name: "Adicionar pessoa" });

    const input = screen.getByPlaceholderText("Buscar pelo nome…");
    await user.type(input, "Diego");
    await vi.advanceTimersByTimeAsync(300);
    expect(await screen.findByText("Diego Alves")).toBeInTheDocument();

    await user.clear(input);
    expect(screen.queryByText("Diego Alves")).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it("clears the selected person via the clear-selection button", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockGet();
    const user = userEvent.setup();

    render(<MinistryDetailSheet open={true} {...baseProps} />);
    await screen.findByText("Louvor");
    await user.click(screen.getByRole("button", { name: "Adicionar pessoa" }));
    await screen.findByRole("heading", { name: "Adicionar pessoa" });

    await user.type(screen.getByPlaceholderText("Buscar pelo nome…"), "Diego");
    await vi.advanceTimersByTimeAsync(300);
    await user.click(await screen.findByText("Diego Alves"));
    expect(screen.getByDisplayValue("Diego Alves")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Limpar seleção" }));
    expect(screen.queryByDisplayValue("Diego Alves")).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it("shows a toast when adding a person fails", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockGet();
    vi.mocked(api.post).mockRejectedValue({
      isAxiosError: true,
      response: { data: { message: "Pessoa já vinculada." } },
    });
    const user = userEvent.setup();

    render(<MinistryDetailSheet open={true} {...baseProps} />);
    await screen.findByText("Louvor");
    await user.click(screen.getByRole("button", { name: "Adicionar pessoa" }));
    await screen.findByRole("heading", { name: "Adicionar pessoa" });

    await user.type(screen.getByPlaceholderText("Buscar pelo nome…"), "Diego");
    await vi.advanceTimersByTimeAsync(300);
    await user.click(await screen.findByText("Diego Alves"));
    await user.click(screen.getByRole("button", { name: "Adicionar" }));

    expect(await screen.findByText("Pessoa já vinculada.")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(screen.queryByText("Pessoa já vinculada.")).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it("silently ignores a failure loading existing volunteer profiles", async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/volunteers/ministries/mn1") return Promise.resolve({ data: ministry });
      if (url === "/volunteers/profiles") return Promise.reject(new Error("boom"));
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    const user = userEvent.setup();

    render(<MinistryDetailSheet open={true} {...baseProps} />);
    await screen.findByText("Louvor");
    await user.click(screen.getByRole("button", { name: "Adicionar pessoa" }));

    expect(await screen.findByRole("heading", { name: "Adicionar pessoa" })).toBeInTheDocument();
  });

  it("does not save when the name is cleared and ministryId becomes unavailable", async () => {
    mockGet();
    const user = userEvent.setup();

    const { rerender } = render(<MinistryDetailSheet open={true} {...baseProps} />);
    await screen.findByText("Louvor");
    await user.click(screen.getByRole("button", { name: /Editar/ }));

    const nameInput = screen.getByDisplayValue("Louvor");
    await user.clear(nameInput);

    rerender(<MinistryDetailSheet open={true} {...baseProps} ministryId={null} />);
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(api.patch).not.toHaveBeenCalled();
  });

  it("does not make a leader primary when ministryId becomes unavailable", async () => {
    mockGet();
    const user = userEvent.setup();

    const { rerender } = render(<MinistryDetailSheet open={true} {...baseProps} />);
    await screen.findByText("Bruno Lima");

    rerender(<MinistryDetailSheet open={true} {...baseProps} ministryId={null} />);
    await user.click(screen.getByRole("button", { name: "Tornar principal" }));

    expect(api.patch).not.toHaveBeenCalled();
  });

  it("does not remove a member when ministryId becomes unavailable", async () => {
    mockGet();
    const user = userEvent.setup();

    const { rerender } = render(<MinistryDetailSheet open={true} {...baseProps} />);
    await screen.findByText("Carla Dias");

    const removeButtons = screen.getAllByRole("button", { name: "Remover" });
    await user.click(removeButtons[removeButtons.length - 1]);
    await screen.findByText("Remover do ministério?");

    rerender(<MinistryDetailSheet open={true} {...baseProps} ministryId={null} />);
    await user.click(screen.getAllByRole("button", { name: "Remover" }).slice(-1)[0]);

    expect(api.delete).not.toHaveBeenCalled();
  });

  it("falls back to defaults when the ministry has no description or color", async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/volunteers/ministries/mn1") {
        return Promise.resolve({ data: { ...ministry, description: null, color: null } });
      }
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });

    render(<MinistryDetailSheet open={true} {...baseProps} />);
    expect(await screen.findByText("Louvor")).toBeInTheDocument();
  });

  it("clears the description on save when it is blanked out", async () => {
    mockGet();
    vi.mocked(api.patch).mockResolvedValue({ data: {} });
    const user = userEvent.setup();

    render(<MinistryDetailSheet open={true} {...baseProps} />);
    await screen.findByText("Louvor");
    await user.click(screen.getByRole("button", { name: /Editar/ }));

    const descTextarea = screen.getByDisplayValue("Ministério de música");
    await user.clear(descTextarea);
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(
        "/volunteers/ministries/mn1",
        expect.objectContaining({ description: undefined })
      )
    );
  });

  it("accepts a wrapped {data:[...]} shape for the volunteer profiles response", async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/volunteers/ministries/mn1") return Promise.resolve({ data: ministry });
      if (url === "/volunteers/profiles") {
        return Promise.resolve({ data: { data: [{ id: "vp4", person_id: "p4" }] } });
      }
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    const user = userEvent.setup();

    render(<MinistryDetailSheet open={true} {...baseProps} />);
    await screen.findByText("Louvor");
    await user.click(screen.getByRole("button", { name: "Adicionar pessoa" }));
    expect(await screen.findByRole("heading", { name: "Adicionar pessoa" })).toBeInTheDocument();
  });

  it("shows empty-state messages when a ministry has no leaders or volunteers", async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/volunteers/ministries/mn1") {
        return Promise.resolve({ data: { ...ministry, leaders: [], volunteers: [] } });
      }
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });

    render(<MinistryDetailSheet open={true} {...baseProps} />);

    expect(await screen.findByText("Nenhum líder vinculado.")).toBeInTheDocument();
    expect(screen.getByText("Nenhum voluntário vinculado.")).toBeInTheDocument();
  });

  it("closes the add-person modal via its close button, resetting the form", async () => {
    mockGet();
    const user = userEvent.setup();

    render(<MinistryDetailSheet open={true} {...baseProps} />);
    await screen.findByText("Louvor");
    await user.click(screen.getByRole("button", { name: "Adicionar pessoa" }));
    await screen.findByRole("heading", { name: "Adicionar pessoa" });

    await user.type(screen.getByPlaceholderText("Buscar pelo nome…"), "Diego");
    await user.click(screen.getAllByRole("button", { name: "Fechar" })[0]);

    expect(screen.queryByRole("heading", { name: "Adicionar pessoa" })).not.toBeInTheDocument();
  });

  it("shows a fallback toast when making a leader primary fails", async () => {
    mockGet();
    vi.mocked(api.patch).mockRejectedValue(new Error("boom"));
    const user = userEvent.setup();

    render(<MinistryDetailSheet open={true} {...baseProps} />);
    await screen.findByText("Bruno Lima");
    await user.click(screen.getByRole("button", { name: "Tornar principal" }));

    expect(await screen.findByText("Erro ao atualizar líder principal.")).toBeInTheDocument();
  });

  it("shows a fallback toast when removing a member fails", async () => {
    mockGet();
    vi.mocked(api.delete).mockRejectedValue(new Error("boom"));
    const user = userEvent.setup();

    render(<MinistryDetailSheet open={true} {...baseProps} />);
    await screen.findByText("Carla Dias");

    const removeButtons = screen.getAllByRole("button", { name: "Remover" });
    await user.click(removeButtons[removeButtons.length - 1]);
    await screen.findByText("Remover do ministério?");
    await user.click(screen.getAllByRole("button", { name: "Remover" }).slice(-1)[0]);

    expect(await screen.findByText("Erro ao remover pessoa.")).toBeInTheDocument();
  });

  it("cancels the add-person modal", async () => {
    mockGet();
    const user = userEvent.setup();

    render(<MinistryDetailSheet open={true} {...baseProps} />);
    await screen.findByText("Louvor");
    await user.click(screen.getByRole("button", { name: "Adicionar pessoa" }));
    await screen.findByRole("heading", { name: "Adicionar pessoa" });

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("heading", { name: "Adicionar pessoa" })).not.toBeInTheDocument();
  });
});
