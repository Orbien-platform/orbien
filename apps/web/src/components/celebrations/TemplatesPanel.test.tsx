import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TemplatesPanel, type ScheduleTemplate } from "./TemplatesPanel";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const ministryTree = [{ id: "mn1", name: "Louvor", children: [] }];

const templates: ScheduleTemplate[] = [
  {
    id: "t1",
    name: "Culto de domingo",
    description: "Padrão semanal",
    is_active: true,
    ministries: [
      { id: "tm1", ministry_id: "mn1", slots: 3, ministry: { id: "mn1", name: "Louvor" } },
    ],
  },
];

function mockGet(templateList = templates) {
  vi.mocked(api.get).mockImplementation((url: string) => {
    if (url === "/celebrations/schedule-templates") {
      return Promise.resolve({ data: templateList });
    }
    if (url === "/volunteers/ministries") {
      return Promise.resolve({ data: ministryTree });
    }
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
}

describe("TemplatesPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads and lists templates with their ministries", async () => {
    mockGet();
    render(<TemplatesPanel canEdit={true} />);

    expect(await screen.findByText("Culto de domingo")).toBeInTheDocument();
    expect(screen.getByText("Padrão semanal")).toBeInTheDocument();
    expect(screen.getByText("Louvor")).toBeInTheDocument();
    expect(screen.getByText("1 template de escala")).toBeInTheDocument();
  });

  it("shows an empty state when there are no templates", async () => {
    mockGet([]);
    render(<TemplatesPanel canEdit={true} />);
    expect(await screen.findByText("Nenhum template cadastrado.")).toBeInTheDocument();
  });

  it("shows an error message when loading fails", async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/celebrations/schedule-templates") {
        return Promise.reject({ isAxiosError: false });
      }
      return Promise.resolve({ data: ministryTree });
    });
    render(<TemplatesPanel canEdit={true} />);
    expect(
      await screen.findByText("Não foi possível carregar os templates.")
    ).toBeInTheDocument();
  });

  it("does not show create/edit actions when canEdit is false", async () => {
    mockGet();
    render(<TemplatesPanel canEdit={false} />);
    await screen.findByText("Culto de domingo");
    expect(screen.queryByRole("button", { name: "Novo template" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Editar/ })).not.toBeInTheDocument();
  });

  it("validates required name and at least one ministry when creating a template", async () => {
    mockGet();
    const user = userEvent.setup();
    render(<TemplatesPanel canEdit={true} />);
    await screen.findByText("Culto de domingo");

    await user.click(screen.getByRole("button", { name: "Novo template" }));
    await user.click(screen.getByRole("button", { name: "Criar" }));

    expect(await screen.findByText("Dê um nome ao template.")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Nome"), "Culto de quarta");
    await user.click(screen.getByRole("button", { name: "Criar" }));

    expect(await screen.findByText("Escolha ao menos um ministério.")).toBeInTheDocument();
  });

  it("creates a template with a ministry and slots", async () => {
    mockGet();
    vi.mocked(api.post).mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    render(<TemplatesPanel canEdit={true} />);
    await screen.findByText("Culto de domingo");

    await user.click(screen.getByRole("button", { name: "Novo template" }));
    await user.type(screen.getByLabelText("Nome"), "Culto de quarta");
    await user.selectOptions(screen.getByLabelText("Ministério 1"), "mn1");
    await user.click(screen.getByRole("button", { name: "Criar" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/celebrations/schedule-templates", {
        name: "Culto de quarta",
        description: undefined,
        ministries: [{ ministry_id: "mn1", slots: 1 }],
      })
    );
  });

  it("opens the edit form pre-filled and updates the template", async () => {
    mockGet();
    vi.mocked(api.patch).mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    render(<TemplatesPanel canEdit={true} />);
    await screen.findByText("Culto de domingo");

    await user.click(screen.getByRole("button", { name: "Editar Culto de domingo" }));

    expect(await screen.findByDisplayValue("Culto de domingo")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(
        "/celebrations/schedule-templates/t1",
        expect.objectContaining({ name: "Culto de domingo" })
      )
    );
  });

  it("shows an error from the API when saving fails", async () => {
    mockGet();
    const err = {
      isAxiosError: true,
      response: { data: { message: "Nome já em uso." } },
    };
    vi.mocked(api.post).mockRejectedValue(err);
    const user = userEvent.setup();
    render(<TemplatesPanel canEdit={true} />);
    await screen.findByText("Culto de domingo");

    await user.click(screen.getByRole("button", { name: "Novo template" }));
    await user.type(screen.getByLabelText("Nome"), "Culto de quarta");
    await user.selectOptions(screen.getByLabelText("Ministério 1"), "mn1");
    await user.click(screen.getByRole("button", { name: "Criar" }));

    expect(await screen.findByText("Nome já em uso.")).toBeInTheDocument();
  });

  it("deletes a template", async () => {
    mockGet();
    vi.mocked(api.delete).mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    render(<TemplatesPanel canEdit={true} />);
    await screen.findByText("Culto de domingo");

    await user.click(screen.getByRole("button", { name: "Excluir Culto de domingo" }));

    await waitFor(() =>
      expect(api.delete).toHaveBeenCalledWith("/celebrations/schedule-templates/t1")
    );
  });

  it("shows an error message when deleting a template fails", async () => {
    mockGet();
    vi.mocked(api.delete).mockRejectedValue({ isAxiosError: false });
    const user = userEvent.setup();
    render(<TemplatesPanel canEdit={true} />);
    await screen.findByText("Culto de domingo");

    await user.click(screen.getByRole("button", { name: "Excluir Culto de domingo" }));

    expect(
      await screen.findByText("Não foi possível excluir o template.")
    ).toBeInTheDocument();
  });

  it("falls back to an empty ministry tree when the ministries fetch fails", async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/celebrations/schedule-templates") return Promise.resolve({ data: templates });
      if (url === "/volunteers/ministries") return Promise.reject(new Error("boom"));
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    const user = userEvent.setup();
    render(<TemplatesPanel canEdit={true} />);
    await screen.findByText("Culto de domingo");

    await user.click(screen.getByRole("button", { name: "Novo template" }));

    expect(
      await screen.findByText(
        "Nenhum ministério cadastrado. Crie ministérios em Voluntários antes de montar um template."
      )
    ).toBeInTheDocument();
  });

  it("edits the description field", async () => {
    mockGet();
    const user = userEvent.setup();
    render(<TemplatesPanel canEdit={true} />);
    await screen.findByText("Culto de domingo");

    await user.click(screen.getByRole("button", { name: "Novo template" }));
    await user.type(screen.getByLabelText("Descrição (opcional)"), "Todo domingo");

    expect(screen.getByLabelText("Descrição (opcional)")).toHaveValue("Todo domingo");
  });

  it("adds and removes ministry rows, and validates duplicate ministries", async () => {
    mockGet();
    const user = userEvent.setup();
    render(<TemplatesPanel canEdit={true} />);
    await screen.findByText("Culto de domingo");

    await user.click(screen.getByRole("button", { name: "Novo template" }));
    await user.type(screen.getByLabelText("Nome"), "Culto de quarta");

    const removeButton1 = screen.getByRole("button", { name: "Remover linha 1" });
    expect(removeButton1).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Adicionar ministério" }));
    expect(screen.getByLabelText("Ministério 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remover linha 1" })).not.toBeDisabled();

    await user.selectOptions(screen.getByLabelText("Ministério 1"), "mn1");
    await user.selectOptions(screen.getByLabelText("Ministério 2"), "mn1");
    await user.click(screen.getByRole("button", { name: "Criar" }));
    expect(await screen.findByText("Há ministério repetido.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remover linha 2" }));
    expect(screen.queryByLabelText("Ministério 2")).not.toBeInTheDocument();
  });

  it("validates that slots must be a positive integer", async () => {
    mockGet();
    const user = userEvent.setup();
    render(<TemplatesPanel canEdit={true} />);
    await screen.findByText("Culto de domingo");

    await user.click(screen.getByRole("button", { name: "Novo template" }));
    await user.type(screen.getByLabelText("Nome"), "Culto de quarta");
    await user.selectOptions(screen.getByLabelText("Ministério 1"), "mn1");
    await user.clear(screen.getByLabelText("Vagas 1"));
    await user.type(screen.getByLabelText("Vagas 1"), "1.5");
    await user.click(screen.getByRole("button", { name: "Criar" }));

    expect(
      await screen.findByText("Vagas precisa ser um inteiro maior que zero.")
    ).toBeInTheDocument();
  });

  it("shows a template with no description and no ministries", async () => {
    mockGet([
      { id: "t2", name: "Vazio", description: null, is_active: true, ministries: [] },
    ]);
    render(<TemplatesPanel canEdit={true} />);

    expect(await screen.findByText("Vazio")).toBeInTheDocument();
    expect(screen.getByText("Nenhum ministério")).toBeInTheDocument();
  });

  it("pre-fills the edit form with an empty ministry row when the template has none", async () => {
    mockGet([
      { id: "t2", name: "Vazio", description: null, is_active: true, ministries: [] },
    ]);
    const user = userEvent.setup();
    render(<TemplatesPanel canEdit={true} />);
    await screen.findByText("Vazio");

    await user.click(screen.getByRole("button", { name: "Editar Vazio" }));

    expect(await screen.findByLabelText("Ministério 1")).toHaveValue("");
  });

  it("indents nested ministries in the picker with a tree prefix", async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/celebrations/schedule-templates") return Promise.resolve({ data: templates });
      if (url === "/volunteers/ministries") {
        return Promise.resolve({
          data: [{ id: "mn1", name: "Louvor", children: [{ id: "mn1a", name: "Coral", children: [] }] }],
        });
      }
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    const user = userEvent.setup();
    render(<TemplatesPanel canEdit={true} />);
    await screen.findByText("Culto de domingo");

    await user.click(screen.getByRole("button", { name: "Novo template" }));

    const select = await screen.findByLabelText("Ministério 1");
    expect(select).toHaveTextContent("└ Coral");
  });

  it("ignores the templates response if the component unmounts before it resolves", async () => {
    let resolveGet!: (value: { data: typeof templates }) => void;
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/celebrations/schedule-templates") {
        return new Promise((resolve) => { resolveGet = resolve; });
      }
      return Promise.resolve({ data: [] });
    });
    const { unmount } = render(<TemplatesPanel canEdit={true} />);
    unmount();

    resolveGet({ data: templates });
    await Promise.resolve();
    await Promise.resolve();
  });

  it("ignores a templates fetch rejection if the component unmounts before it settles", async () => {
    let rejectGet!: (err: unknown) => void;
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/celebrations/schedule-templates") {
        return new Promise((_resolve, reject) => { rejectGet = reject; });
      }
      return Promise.resolve({ data: [] });
    });
    const { unmount } = render(<TemplatesPanel canEdit={true} />);
    unmount();

    rejectGet(new Error("too late"));
    await Promise.resolve();
    await Promise.resolve();
  });

  it("falls back to an empty list when the templates response isn't an array", async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/celebrations/schedule-templates") return Promise.resolve({ data: null as unknown as typeof templates });
      return Promise.resolve({ data: ministryTree });
    });
    render(<TemplatesPanel canEdit={true} />);
    expect(await screen.findByText("Nenhum template cadastrado.")).toBeInTheDocument();
  });

  it("falls back to an empty ministry tree when the ministries response isn't an array", async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/celebrations/schedule-templates") return Promise.resolve({ data: templates });
      if (url === "/volunteers/ministries") return Promise.resolve({ data: null as unknown as typeof ministryTree });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    const user = userEvent.setup();
    render(<TemplatesPanel canEdit={true} />);
    await screen.findByText("Culto de domingo");

    await user.click(screen.getByRole("button", { name: "Novo template" }));

    expect(
      await screen.findByText(
        "Nenhum ministério cadastrado. Crie ministérios em Voluntários antes de montar um template."
      )
    ).toBeInTheDocument();
  });

  it("rejects negative slot counts even though they parse as truthy numbers", async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/celebrations/schedule-templates") return Promise.resolve({ data: templates });
      if (url === "/volunteers/ministries") {
        return Promise.resolve({
          data: [{ id: "mn1", name: "Louvor", children: [] }, { id: "mn2", name: "Recepção", children: [] }],
        });
      }
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    const user = userEvent.setup();
    render(<TemplatesPanel canEdit={true} />);
    await screen.findByText("Culto de domingo");

    await user.click(screen.getByRole("button", { name: "Novo template" }));
    await user.type(screen.getByLabelText("Nome"), "Culto de quarta");
    await user.selectOptions(screen.getByLabelText("Ministério 1"), "mn1");

    await user.click(screen.getByRole("button", { name: "Adicionar ministério" }));
    await user.selectOptions(screen.getByLabelText("Ministério 2"), "mn2");
    await user.clear(screen.getByLabelText("Vagas 2"));
    await user.type(screen.getByLabelText("Vagas 2"), "-1");

    await user.click(screen.getByRole("button", { name: "Criar" }));

    expect(
      await screen.findByText("Vagas precisa ser um inteiro maior que zero.")
    ).toBeInTheDocument();
  });

  it("closes the form via the Cancelar button", async () => {
    mockGet();
    const user = userEvent.setup();
    render(<TemplatesPanel canEdit={true} />);
    await screen.findByText("Culto de domingo");

    await user.click(screen.getByRole("button", { name: "Novo template" }));
    expect(await screen.findByRole("heading", { name: "Novo template" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(
      screen.queryByRole("heading", { name: "Novo template" })
    ).not.toBeInTheDocument();
  });
});
