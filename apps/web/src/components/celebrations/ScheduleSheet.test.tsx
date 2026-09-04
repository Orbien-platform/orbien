import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ScheduleSheet } from "./ScheduleSheet";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const ministryTree = [{ id: "mn1", name: "Louvor", children: [] }];
const templates = [
  { id: "t1", name: "Padrão", description: null, is_active: true, ministries: [{ id: "tm1", ministry_id: "mn1", slots: 2, ministry: { id: "mn1", name: "Louvor" } }] },
];

const scheduleWithMinistry = {
  id: "sc1",
  status: "draft",
  celebration_instance_id: "i1",
  ministries: [
    {
      id: "cm1",
      ministry_id: "mn1",
      slots: 2,
      assigned_count: 1,
      ministry: { id: "mn1", name: "Louvor" },
      assignments: [
        {
          id: "as1",
          status: "pending",
          notified_at: null,
          responded_at: null,
          volunteer_profile_id: "vp1",
          volunteerProfile: { id: "vp1", person: { id: "p1", full_name: "Ana Souza" } },
        },
      ],
    },
  ],
};

function mockGet(opts: {
  schedule?: object | null;
  scheduleStatus?: number;
  tree?: object[];
  templates?: object[];
} = {}) {
  const { schedule = null, scheduleStatus = 404, tree = ministryTree, templates: tpls = templates } = opts;
  vi.mocked(api.get).mockImplementation((url: string) => {
    if (url === "/celebrations/instances/i1/schedule") {
      if (schedule) return Promise.resolve({ data: schedule });
      return Promise.reject({ isAxiosError: true, response: { status: scheduleStatus } });
    }
    if (url === "/volunteers/ministries") return Promise.resolve({ data: tree });
    if (url === "/celebrations/schedule-templates") return Promise.resolve({ data: tpls });
    if (url.startsWith("/volunteers/ministries/mn1/availability")) {
      return Promise.resolve({
        data: [
          { volunteer_profile_id: "vp1", role: "volunteer", person: { id: "p1", full_name: "Ana Souza" }, unavailable: false },
          { volunteer_profile_id: "vp2", role: "leader", person: { id: "p2", full_name: "Bruno Lima" }, unavailable: true },
        ],
      });
    }
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
}

const baseProps = {
  onOpenChange: vi.fn(),
  instanceId: "i1",
  celebrationName: "Culto Domingo",
  scheduledDate: "2026-09-06T10:00:00.000Z",
};

describe("ScheduleSheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not render content when closed", () => {
    mockGet();
    render(<ScheduleSheet open={false} {...baseProps} onChanged={vi.fn()} />);
    expect(screen.queryByText("Culto Domingo")).not.toBeInTheDocument();
  });

  it("shows the empty state and creates a schedule on demand", async () => {
    mockGet();
    vi.mocked(api.post).mockResolvedValue({ data: {} });
    const onChanged = vi.fn();
    const user = userEvent.setup();
    render(<ScheduleSheet open={true} {...baseProps} onChanged={onChanged} />);

    expect(
      await screen.findByText("Esta celebração ainda não tem escala.")
    ).toBeInTheDocument();

    mockGet({ schedule: { id: "sc1", status: "draft", celebration_instance_id: "i1", ministries: [] } });
    await user.click(screen.getByRole("button", { name: "Criar escala" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/celebrations/instances/i1/schedule")
    );
    expect(onChanged).toHaveBeenCalled();
  });

  it("shows an error message when creating the schedule fails", async () => {
    mockGet();
    vi.mocked(api.post).mockRejectedValue(new Error("fail"));
    const user = userEvent.setup();
    render(<ScheduleSheet open={true} {...baseProps} onChanged={vi.fn()} />);

    await screen.findByText("Esta celebração ainda não tem escala.");
    await user.click(screen.getByRole("button", { name: "Criar escala" }));

    expect(
      await screen.findByText("Não foi possível criar a escala.")
    ).toBeInTheDocument();
  });

  it("lists ministries with assignments and their status", async () => {
    mockGet({ schedule: scheduleWithMinistry });
    render(<ScheduleSheet open={true} {...baseProps} onChanged={vi.fn()} />);

    expect(await screen.findByText("Louvor")).toBeInTheDocument();
    expect(screen.getByText("1/2")).toBeInTheDocument();
    expect(screen.getByText("Ana Souza")).toBeInTheDocument();
    expect(screen.getByText("Aguardando")).toBeInTheDocument();
    expect(screen.getByText("Rascunho")).toBeInTheDocument();
  });

  it("adds a ministry to the schedule", async () => {
    mockGet({ schedule: { id: "sc1", status: "draft", celebration_instance_id: "i1", ministries: [] } });
    vi.mocked(api.post).mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    render(<ScheduleSheet open={true} {...baseProps} onChanged={vi.fn()} />);

    await screen.findByText("Nenhum ministério na escala. Adicione o primeiro abaixo.");
    await user.click(screen.getByRole("button", { name: "Adicionar ministério" }));
    await user.selectOptions(screen.getByLabelText("Ministério"), "mn1");
    await user.click(screen.getByRole("button", { name: "Adicionar" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/celebrations/instances/i1/schedule/ministries",
        { ministry_id: "mn1", slots: 1 }
      )
    );
  });

  it("removes a ministry from the schedule", async () => {
    mockGet({ schedule: scheduleWithMinistry });
    vi.mocked(api.delete).mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    render(<ScheduleSheet open={true} {...baseProps} onChanged={vi.fn()} />);

    await screen.findByText("Louvor");
    await user.click(screen.getByRole("button", { name: "Remover Louvor da escala" }));

    await waitFor(() =>
      expect(api.delete).toHaveBeenCalledWith(
        "/celebrations/instances/i1/schedule/ministries/mn1"
      )
    );
  });

  it("opens the volunteer picker and assigns an available volunteer", async () => {
    mockGet({ schedule: scheduleWithMinistry });
    vi.mocked(api.post).mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    render(<ScheduleSheet open={true} {...baseProps} onChanged={vi.fn()} />);

    await screen.findByText("Louvor");
    await user.click(screen.getByRole("button", { name: "Adicionar voluntário" }));

    expect(await screen.findByText("Bruno Lima")).toBeInTheDocument();
    expect(screen.getByText("indisponível")).toBeInTheDocument();
    expect(screen.getByText("já escalado")).toBeInTheDocument();

    await user.click(screen.getByText("Bruno Lima").closest("button")!);

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/celebrations/instances/i1/schedule/ministries/cm1/assignments",
        { volunteer_profile_id: "vp2" }
      )
    );
  });

  it("shows a warning notice when the assignment is overbooked", async () => {
    mockGet({ schedule: scheduleWithMinistry });
    vi.mocked(api.post).mockResolvedValue({ data: { overbooked: true } });
    const user = userEvent.setup();
    render(<ScheduleSheet open={true} {...baseProps} onChanged={vi.fn()} />);

    await screen.findByText("Louvor");
    await user.click(screen.getByRole("button", { name: "Adicionar voluntário" }));
    await screen.findByText("Bruno Lima");
    await user.click(screen.getByText("Bruno Lima").closest("button")!);

    expect(
      await screen.findByText("Atribuído, mas acima do número de vagas.")
    ).toBeInTheDocument();
  });

  it("unassigns a volunteer", async () => {
    mockGet({ schedule: scheduleWithMinistry });
    vi.mocked(api.delete).mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    render(<ScheduleSheet open={true} {...baseProps} onChanged={vi.fn()} />);

    await screen.findByText("Ana Souza");
    await user.click(screen.getByRole("button", { name: "Remover Ana Souza da escala" }));

    await waitFor(() =>
      expect(api.delete).toHaveBeenCalledWith(
        "/celebrations/instances/i1/schedule/ministries/cm1/assignments/as1"
      )
    );
  });

  it("applies a template", async () => {
    mockGet({ schedule: { id: "sc1", status: "draft", celebration_instance_id: "i1", ministries: [] } });
    vi.mocked(api.post).mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    render(<ScheduleSheet open={true} {...baseProps} onChanged={vi.fn()} />);

    await screen.findByLabelText("Aplicar template");
    await user.selectOptions(screen.getByLabelText("Aplicar template"), "t1");
    await user.click(screen.getByRole("button", { name: "Aplicar" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/celebrations/instances/i1/schedule/apply-template",
        { template_id: "t1" }
      )
    );
  });

  it("publishes the schedule", async () => {
    mockGet({ schedule: scheduleWithMinistry });
    vi.mocked(api.patch).mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    render(<ScheduleSheet open={true} {...baseProps} onChanged={vi.fn()} />);

    await screen.findByText("Louvor");
    await user.click(screen.getByRole("button", { name: "Publicar escala" }));

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith("/celebrations/instances/i1/schedule/publish")
    );
    expect(
      await screen.findByText("Escala publicada. 1 voluntário notificado.")
    ).toBeInTheDocument();
  });

  it("shows the API-provided error message when creating the schedule fails with an axios error", async () => {
    mockGet();
    vi.mocked(api.post).mockRejectedValue({
      isAxiosError: true,
      response: { data: { message: "Mensagem específica da API." } },
    });
    const user = userEvent.setup();
    render(<ScheduleSheet open={true} {...baseProps} onChanged={vi.fn()} />);

    await screen.findByText("Esta celebração ainda não tem escala.");
    await user.click(screen.getByRole("button", { name: "Criar escala" }));

    expect(await screen.findByText("Mensagem específica da API.")).toBeInTheDocument();
  });

  it("shows a generic error when loading the schedule fails with a non-404 error", async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/celebrations/instances/i1/schedule") {
        return Promise.reject({ isAxiosError: true, response: { status: 500 } });
      }
      if (url === "/volunteers/ministries") return Promise.resolve({ data: ministryTree });
      if (url === "/celebrations/schedule-templates") return Promise.resolve({ data: templates });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    render(<ScheduleSheet open={true} {...baseProps} onChanged={vi.fn()} />);

    expect(
      await screen.findByText("Não foi possível carregar a escala.")
    ).toBeInTheDocument();
  });

  it("ignores a cancelled load when the instance changes before it resolves (success and failure)", async () => {
    let resolveFirst!: (v: { data: unknown }) => void;
    let rejectSecond!: (e: unknown) => void;
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/celebrations/instances/i1/schedule") {
        return new Promise((resolve) => { resolveFirst = resolve; });
      }
      if (url === "/celebrations/instances/i2/schedule") {
        return new Promise((_resolve, reject) => { rejectSecond = reject; });
      }
      if (url === "/volunteers/ministries") return Promise.resolve({ data: ministryTree });
      if (url === "/celebrations/schedule-templates") return Promise.resolve({ data: templates });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });

    const { rerender } = render(<ScheduleSheet open={true} {...baseProps} onChanged={vi.fn()} />);
    rerender(<ScheduleSheet open={true} {...baseProps} instanceId="i2" onChanged={vi.fn()} />);
    rerender(<ScheduleSheet open={false} {...baseProps} instanceId="i2" onChanged={vi.fn()} />);

    resolveFirst({ data: scheduleWithMinistry });
    rejectSecond({ isAxiosError: true, response: { status: 500 } });
    await Promise.resolve();
    await Promise.resolve();

    // Nothing crashes and no stale state leaks in — the sheet is closed.
    expect(screen.queryByText("Culto Domingo")).not.toBeInTheDocument();
  });

  it("falls back to an empty ministry tree and template list when those requests fail", async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/celebrations/instances/i1/schedule") {
        return Promise.resolve({ data: { id: "sc1", status: "draft", celebration_instance_id: "i1", ministries: [] } });
      }
      if (url === "/volunteers/ministries") return Promise.reject(new Error("fail"));
      if (url === "/celebrations/schedule-templates") return Promise.reject(new Error("fail"));
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    const user = userEvent.setup();
    render(<ScheduleSheet open={true} {...baseProps} onChanged={vi.fn()} />);

    await screen.findByText("Nenhum ministério na escala. Adicione o primeiro abaixo.");
    // No templates block since the list came back empty.
    expect(screen.queryByLabelText("Aplicar template")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Adicionar ministério" }));
    expect(screen.getByLabelText("Ministério")).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Louvor" })).not.toBeInTheDocument();
  });

  it("treats a non-array ministry tree / template / availability response as empty", async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/celebrations/instances/i1/schedule") {
        return Promise.resolve({ data: scheduleWithMinistry });
      }
      if (url === "/volunteers/ministries") return Promise.resolve({ data: null });
      if (url === "/celebrations/schedule-templates") return Promise.resolve({ data: null });
      if (url.startsWith("/volunteers/ministries/mn1/availability")) {
        return Promise.resolve({ data: null });
      }
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    const user = userEvent.setup();
    render(<ScheduleSheet open={true} {...baseProps} onChanged={vi.fn()} />);

    await screen.findByText("Louvor");
    expect(screen.queryByLabelText("Aplicar template")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Adicionar voluntário" }));
    expect(
      await screen.findByText("Nenhum voluntário vinculado a este ministério.")
    ).toBeInTheDocument();
  });

  it("resets state when the sheet is closed via its close button", async () => {
    mockGet({ schedule: scheduleWithMinistry });
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<ScheduleSheet open={true} {...baseProps} onOpenChange={onOpenChange} onChanged={vi.fn()} />);

    await screen.findByText("Louvor");
    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("does not create a schedule when the instance id becomes unavailable", async () => {
    mockGet();
    const { rerender } = render(<ScheduleSheet open={true} {...baseProps} onChanged={vi.fn()} />);
    await screen.findByText("Esta celebração ainda não tem escala.");

    rerender(<ScheduleSheet open={true} {...baseProps} instanceId={null} onChanged={vi.fn()} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Criar escala" }));

    expect(api.post).not.toHaveBeenCalled();
  });

  it("no-ops actions when the instance id becomes unavailable mid-session", async () => {
    mockGet({ schedule: { id: "sc1", status: "draft", celebration_instance_id: "i1", ministries: [] } });
    const user = userEvent.setup();

    const { rerender } = render(<ScheduleSheet open={true} {...baseProps} onChanged={vi.fn()} />);
    await screen.findByText("Nenhum ministério na escala. Adicione o primeiro abaixo.");

    // -- addMinistry guard: pick a ministry, then pull the instance id away --
    await user.click(screen.getByRole("button", { name: "Adicionar ministério" }));
    await user.selectOptions(screen.getByLabelText("Ministério"), "mn1");
    rerender(<ScheduleSheet open={true} {...baseProps} instanceId={null} onChanged={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Adicionar" }));
    expect(api.post).not.toHaveBeenCalled();

    // -- applyTemplate guard: restore the instance, pick a template, pull it away again --
    rerender(<ScheduleSheet open={true} {...baseProps} onChanged={vi.fn()} />);
    await screen.findByLabelText("Aplicar template");
    await user.selectOptions(screen.getByLabelText("Aplicar template"), "t1");
    rerender(<ScheduleSheet open={true} {...baseProps} instanceId={null} onChanged={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(api.post).not.toHaveBeenCalled();
  });

  it("does not call removeMinistry, assign, unassign or publish when the instance id is unavailable", async () => {
    mockGet({ schedule: scheduleWithMinistry });
    const user = userEvent.setup();
    const { rerender } = render(<ScheduleSheet open={true} {...baseProps} onChanged={vi.fn()} />);

    await screen.findByText("Louvor");
    await user.click(screen.getByRole("button", { name: "Adicionar voluntário" }));
    await screen.findByText("Bruno Lima");

    rerender(<ScheduleSheet open={true} {...baseProps} instanceId={null} onChanged={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Remover Louvor da escala" }));
    expect(api.delete).not.toHaveBeenCalled();

    await user.click(screen.getByText("Bruno Lima").closest("button")!);
    expect(api.post).not.toHaveBeenCalledWith(
      expect.stringContaining("/assignments"),
      expect.anything()
    );

    await user.click(screen.getByRole("button", { name: "Remover Ana Souza da escala" }));
    expect(api.delete).not.toHaveBeenCalledWith(expect.stringContaining("/assignments/"));

    await user.click(screen.getByRole("button", { name: "Publicar escala" }));
    expect(api.patch).not.toHaveBeenCalled();
  });

  it("closes the volunteer picker when clicking its toggle a second time", async () => {
    mockGet({ schedule: scheduleWithMinistry });
    const user = userEvent.setup();
    render(<ScheduleSheet open={true} {...baseProps} onChanged={vi.fn()} />);

    await screen.findByText("Louvor");
    await user.click(screen.getByRole("button", { name: "Adicionar voluntário" }));
    await screen.findByText("Bruno Lima");

    await user.click(screen.getByRole("button", { name: "Adicionar voluntário" }));
    expect(screen.queryByText("Bruno Lima")).not.toBeInTheDocument();
  });

  it("shows a loading spinner while fetching volunteer availability", async () => {
    let resolveAvailability!: (v: { data: unknown }) => void;
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/celebrations/instances/i1/schedule") return Promise.resolve({ data: scheduleWithMinistry });
      if (url === "/volunteers/ministries") return Promise.resolve({ data: ministryTree });
      if (url === "/celebrations/schedule-templates") return Promise.resolve({ data: templates });
      if (url.startsWith("/volunteers/ministries/mn1/availability")) {
        return new Promise((resolve) => { resolveAvailability = resolve; });
      }
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    const user = userEvent.setup();
    render(<ScheduleSheet open={true} {...baseProps} onChanged={vi.fn()} />);

    await screen.findByText("Louvor");
    await user.click(screen.getByRole("button", { name: "Adicionar voluntário" }));

    expect(document.querySelector(".animate-spin")).toBeInTheDocument();

    resolveAvailability({ data: [] });
    await screen.findByText("Nenhum voluntário vinculado a este ministério.");
  });

  it("shows an error and closes the picker when loading availability fails", async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/celebrations/instances/i1/schedule") return Promise.resolve({ data: scheduleWithMinistry });
      if (url === "/volunteers/ministries") return Promise.resolve({ data: ministryTree });
      if (url === "/celebrations/schedule-templates") return Promise.resolve({ data: templates });
      if (url.startsWith("/volunteers/ministries/mn1/availability")) return Promise.reject(new Error("fail"));
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    const user = userEvent.setup();
    render(<ScheduleSheet open={true} {...baseProps} onChanged={vi.fn()} />);

    await screen.findByText("Louvor");
    await user.click(screen.getByRole("button", { name: "Adicionar voluntário" }));

    expect(
      await screen.findByText("Não foi possível carregar os voluntários do ministério.")
    ).toBeInTheDocument();
    expect(screen.queryByText("Nenhum voluntário vinculado a este ministério.")).not.toBeInTheDocument();
  });

  it("shows an error when adding a ministry fails", async () => {
    mockGet({ schedule: { id: "sc1", status: "draft", celebration_instance_id: "i1", ministries: [] } });
    vi.mocked(api.post).mockRejectedValue(new Error("fail"));
    const user = userEvent.setup();
    render(<ScheduleSheet open={true} {...baseProps} onChanged={vi.fn()} />);

    await screen.findByText("Nenhum ministério na escala. Adicione o primeiro abaixo.");
    await user.click(screen.getByRole("button", { name: "Adicionar ministério" }));
    await user.selectOptions(screen.getByLabelText("Ministério"), "mn1");
    await user.click(screen.getByRole("button", { name: "Adicionar" }));

    expect(
      await screen.findByText("Não foi possível adicionar o ministério.")
    ).toBeInTheDocument();
  });

  it("validates the slots field before adding a ministry", async () => {
    mockGet({ schedule: { id: "sc1", status: "draft", celebration_instance_id: "i1", ministries: [] } });
    const user = userEvent.setup();
    render(<ScheduleSheet open={true} {...baseProps} onChanged={vi.fn()} />);

    await screen.findByText("Nenhum ministério na escala. Adicione o primeiro abaixo.");
    await user.click(screen.getByRole("button", { name: "Adicionar ministério" }));
    await user.selectOptions(screen.getByLabelText("Ministério"), "mn1");
    await user.clear(screen.getByLabelText("Vagas"));
    await user.type(screen.getByLabelText("Vagas"), "0");
    await user.click(screen.getByRole("button", { name: "Adicionar" }));

    expect(
      await screen.findByText("Número de vagas precisa ser um inteiro maior que zero.")
    ).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("closes the add-ministry form via its own Cancelar button", async () => {
    mockGet({ schedule: { id: "sc1", status: "draft", celebration_instance_id: "i1", ministries: [] } });
    const user = userEvent.setup();
    render(<ScheduleSheet open={true} {...baseProps} onChanged={vi.fn()} />);

    await screen.findByText("Nenhum ministério na escala. Adicione o primeiro abaixo.");
    await user.click(screen.getByRole("button", { name: "Adicionar ministério" }));
    expect(screen.getByLabelText("Ministério")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByLabelText("Ministério")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Adicionar ministério" })).toBeInTheDocument();
  });

  it("shows an error when applying a template fails", async () => {
    mockGet({ schedule: { id: "sc1", status: "draft", celebration_instance_id: "i1", ministries: [] } });
    vi.mocked(api.post).mockRejectedValue(new Error("fail"));
    const user = userEvent.setup();
    render(<ScheduleSheet open={true} {...baseProps} onChanged={vi.fn()} />);

    await screen.findByLabelText("Aplicar template");
    await user.selectOptions(screen.getByLabelText("Aplicar template"), "t1");
    await user.click(screen.getByRole("button", { name: "Aplicar" }));

    expect(
      await screen.findByText("Não foi possível aplicar o template.")
    ).toBeInTheDocument();
  });

  it("shows an error when removing a ministry fails", async () => {
    mockGet({ schedule: scheduleWithMinistry });
    vi.mocked(api.delete).mockRejectedValue(new Error("fail"));
    const user = userEvent.setup();
    render(<ScheduleSheet open={true} {...baseProps} onChanged={vi.fn()} />);

    await screen.findByText("Louvor");
    await user.click(screen.getByRole("button", { name: "Remover Louvor da escala" }));

    expect(
      await screen.findByText("Não foi possível remover o ministério.")
    ).toBeInTheDocument();
  });

  it("shows an error when assigning a volunteer fails", async () => {
    mockGet({ schedule: scheduleWithMinistry });
    vi.mocked(api.post).mockRejectedValue(new Error("fail"));
    const user = userEvent.setup();
    render(<ScheduleSheet open={true} {...baseProps} onChanged={vi.fn()} />);

    await screen.findByText("Louvor");
    await user.click(screen.getByRole("button", { name: "Adicionar voluntário" }));
    await screen.findByText("Bruno Lima");
    await user.click(screen.getByText("Bruno Lima").closest("button")!);

    expect(
      await screen.findByText("Não foi possível atribuir o voluntário.")
    ).toBeInTheDocument();
  });

  it("shows a warning notice when the volunteer marked themselves unavailable", async () => {
    mockGet({ schedule: scheduleWithMinistry });
    vi.mocked(api.post).mockResolvedValue({ data: { unavailable_on_date: true } });
    const user = userEvent.setup();
    render(<ScheduleSheet open={true} {...baseProps} onChanged={vi.fn()} />);

    await screen.findByText("Louvor");
    await user.click(screen.getByRole("button", { name: "Adicionar voluntário" }));
    await screen.findByText("Bruno Lima");
    await user.click(screen.getByText("Bruno Lima").closest("button")!);

    expect(
      await screen.findByText("Atribuído, mas voluntário marcou indisponibilidade nesta data.")
    ).toBeInTheDocument();
  });

  it("shows an error when unassigning a volunteer fails", async () => {
    mockGet({ schedule: scheduleWithMinistry });
    vi.mocked(api.delete).mockRejectedValue(new Error("fail"));
    const user = userEvent.setup();
    render(<ScheduleSheet open={true} {...baseProps} onChanged={vi.fn()} />);

    await screen.findByText("Ana Souza");
    await user.click(screen.getByRole("button", { name: "Remover Ana Souza da escala" }));

    expect(
      await screen.findByText("Não foi possível remover a atribuição.")
    ).toBeInTheDocument();
  });

  it("shows an error when publishing fails", async () => {
    mockGet({ schedule: scheduleWithMinistry });
    vi.mocked(api.patch).mockRejectedValue(new Error("fail"));
    const user = userEvent.setup();
    render(<ScheduleSheet open={true} {...baseProps} onChanged={vi.fn()} />);

    await screen.findByText("Louvor");
    await user.click(screen.getByRole("button", { name: "Publicar escala" }));

    expect(
      await screen.findByText("Não foi possível publicar a escala.")
    ).toBeInTheDocument();
  });

  it("shows the published/archived status badges and the fully-notified state", async () => {
    const publishedNoPending = {
      ...scheduleWithMinistry,
      status: "published",
      ministries: [
        {
          ...scheduleWithMinistry.ministries[0],
          assignments: [
            { ...scheduleWithMinistry.ministries[0].assignments[0], status: "confirmed", notified_at: "2026-01-01T00:00:00.000Z" },
          ],
        },
      ],
    };
    mockGet({ schedule: publishedNoPending });
    render(<ScheduleSheet open={true} {...baseProps} onChanged={vi.fn()} />);

    expect(await screen.findByText("Publicada")).toBeInTheDocument();
    const publishBtn = screen.getByRole("button", { name: "Todos notificados" });
    expect(publishBtn).toBeDisabled();
  });

  it("shows the archived badge and hides the publish action", async () => {
    mockGet({ schedule: { ...scheduleWithMinistry, status: "archived" } });
    render(<ScheduleSheet open={true} {...baseProps} onChanged={vi.fn()} />);

    expect(await screen.findByText("Arquivada")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Publicar|Notificar|Todos notificados/ })).not.toBeInTheDocument();
  });

  it("notifies pending volunteers again with plural wording when there is more than one", async () => {
    const twoPending = {
      ...scheduleWithMinistry,
      status: "published",
      ministries: [
        {
          ...scheduleWithMinistry.ministries[0],
          assigned_count: 2,
          slots: 2,
          assignments: [
            scheduleWithMinistry.ministries[0].assignments[0],
            {
              id: "as2",
              status: "pending",
              notified_at: null,
              responded_at: null,
              volunteer_profile_id: "vp2",
              volunteerProfile: { id: "vp2", person: { id: "p2", full_name: "Bruno Lima" } },
            },
          ],
        },
      ],
    };
    mockGet({ schedule: twoPending });
    vi.mocked(api.patch).mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    render(<ScheduleSheet open={true} {...baseProps} onChanged={vi.fn()} />);

    await screen.findByText("Publicada");
    await user.click(screen.getByRole("button", { name: "Notificar 2 novos" }));

    expect(
      await screen.findByText("Escala publicada. 2 voluntários notificados.")
    ).toBeInTheDocument();
  });

  it("shows the fully-staffed and overbooked badge states", async () => {
    const mixed = {
      id: "sc1",
      status: "draft",
      celebration_instance_id: "i1",
      ministries: [
        {
          id: "cm1",
          ministry_id: "mn1",
          slots: 1,
          assigned_count: 1,
          ministry: { id: "mn1", name: "Louvor" },
          assignments: [
            {
              id: "as1",
              status: "confirmed",
              notified_at: null,
              responded_at: null,
              volunteer_profile_id: "vp1",
              volunteerProfile: { id: "vp1", person: { id: "p1", full_name: "Ana Souza" } },
            },
          ],
        },
        {
          id: "cm2",
          ministry_id: "mn2",
          slots: 1,
          assigned_count: 2,
          ministry: { id: "mn2", name: "Mídia" },
          assignments: [],
        },
      ],
    };
    mockGet({ schedule: mixed, tree: [{ id: "mn1", name: "Louvor", children: [] }, { id: "mn2", name: "Mídia", children: [] }] });
    render(<ScheduleSheet open={true} {...baseProps} onChanged={vi.fn()} />);

    expect(await screen.findByText("1/1")).toBeInTheDocument();
    expect(screen.getByText("2/1")).toBeInTheDocument();
  });

  it("shows nested ministries indented in the picker, and hides templates when none apply", async () => {
    mockGet({
      schedule: { id: "sc1", status: "draft", celebration_instance_id: "i1", ministries: [] },
      tree: [{ id: "mn1", name: "Louvor", children: [{ id: "mn1a", name: "Vocal", children: [] }] }],
      templates: [],
    });
    const user = userEvent.setup();
    render(<ScheduleSheet open={true} {...baseProps} onChanged={vi.fn()} />);

    await screen.findByText("Nenhum ministério na escala. Adicione o primeiro abaixo.");
    expect(screen.queryByLabelText("Aplicar template")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Adicionar ministério" }));
    expect(screen.getByRole("option", { name: /└ Vocal/ })).toBeInTheDocument();
  });

  it("shows the plain success message when publishing with nothing pending to notify", async () => {
    const noAssignments = {
      id: "sc1",
      status: "draft",
      celebration_instance_id: "i1",
      ministries: [
        { id: "cm1", ministry_id: "mn1", slots: 2, assigned_count: 0, ministry: { id: "mn1", name: "Louvor" }, assignments: [] },
      ],
    };
    mockGet({ schedule: noAssignments });
    vi.mocked(api.patch).mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    render(<ScheduleSheet open={true} {...baseProps} onChanged={vi.fn()} />);

    await screen.findByText("Louvor");
    await user.click(screen.getByRole("button", { name: "Publicar escala" }));

    expect(await screen.findByText("Escala publicada.")).toBeInTheDocument();
  });

  it("uses singular wording when re-notifying a single pending volunteer", async () => {
    mockGet({ schedule: { ...scheduleWithMinistry, status: "published" } });
    vi.mocked(api.patch).mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    render(<ScheduleSheet open={true} {...baseProps} onChanged={vi.fn()} />);

    await screen.findByText("Publicada");
    await user.click(screen.getByRole("button", { name: "Notificar 1 novo" }));

    expect(
      await screen.findByText("Escala publicada. 1 voluntário notificado.")
    ).toBeInTheDocument();
  });
});
