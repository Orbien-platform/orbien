import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CreateSegmentModal } from "./CreateSegmentModal";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

const groups = [{ id: "g1", name: "Célula Alfa" }];
const ministries = [{ id: "mn1", name: "Louvor" }];

describe("CreateSegmentModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/small-groups?limit=100") return Promise.resolve({ data: { data: groups } });
      if (url === "/volunteers/ministries?limit=100")
        return Promise.resolve({ data: { data: ministries } });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
  });

  it("does not render form fields when closed", () => {
    render(<CreateSegmentModal open={false} onOpenChange={vi.fn()} onCreated={vi.fn()} />);
    expect(screen.queryByText("Novo segmento")).not.toBeInTheDocument();
  });

  it("loads groups and ministries when opened, and validates required name", async () => {
    const user = userEvent.setup();
    render(<CreateSegmentModal open={true} onOpenChange={vi.fn()} onCreated={vi.fn()} />);

    expect(await screen.findByText("Célula Alfa")).toBeInTheDocument();
    expect(screen.getByText("Louvor")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Criar segmento" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Nome é obrigatório.");
  });

  it("toggles a group checkbox on and off (deselect branch)", async () => {
    const user = userEvent.setup();
    render(<CreateSegmentModal open={true} onOpenChange={vi.fn()} onCreated={vi.fn()} />);
    await screen.findByText("Célula Alfa");

    const checkbox = screen.getByLabelText("Célula Alfa");
    await user.click(checkbox);
    expect(checkbox).toBeChecked();
    await user.click(checkbox);
    expect(checkbox).not.toBeChecked();
  });

  it("selects a ministry checkbox and includes ministry_ids in the payload", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({ data: {} });
    render(<CreateSegmentModal open={true} onOpenChange={vi.fn()} onCreated={vi.fn()} />);
    await screen.findByText("Louvor");

    await user.type(screen.getByLabelText(/Nome/), "Ministério jovem");
    await user.click(screen.getByLabelText("Louvor"));
    await user.click(screen.getByRole("button", { name: "Criar segmento" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/content/segments", {
        name: "Ministério jovem",
        criteria: { ministry_ids: ["mn1"] },
      })
    );
  });

  it("cancels via the Cancelar button and closes via the modal's own close button", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<CreateSegmentModal open={true} onOpenChange={onOpenChange} onCreated={vi.fn()} />);
    await screen.findByText("Célula Alfa");

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);

    await user.click(screen.getByRole("button", { name: "Fechar" }));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it("empty group/ministry lists render no checkbox sections", async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/small-groups?limit=100") return Promise.resolve({ data: { data: [] } });
      if (url === "/volunteers/ministries?limit=100")
        return Promise.resolve({ data: { data: [] } });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    render(<CreateSegmentModal open={true} onOpenChange={vi.fn()} onCreated={vi.fn()} />);
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("Grupos")).not.toBeInTheDocument();
    expect(screen.queryByText("Ministérios")).not.toBeInTheDocument();
  });

  it("handles flat array responses for groups and ministries (no pagination wrapper)", async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/small-groups?limit=100") return Promise.resolve({ data: groups });
      if (url === "/volunteers/ministries?limit=100") return Promise.resolve({ data: ministries });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    render(<CreateSegmentModal open={true} onOpenChange={vi.fn()} onCreated={vi.fn()} />);
    expect(await screen.findByText("Célula Alfa")).toBeInTheDocument();
    expect(screen.getByText("Louvor")).toBeInTheDocument();
  });

  it("defaults to an empty list when the paginated response has no data field", async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/small-groups?limit=100") return Promise.resolve({ data: {} });
      if (url === "/volunteers/ministries?limit=100") return Promise.resolve({ data: {} });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    render(<CreateSegmentModal open={true} onOpenChange={vi.fn()} onCreated={vi.fn()} />);
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("Grupos")).not.toBeInTheDocument();
    expect(screen.queryByText("Ministérios")).not.toBeInTheDocument();
  });

  it("keeps groups/ministries empty when their fetches fail", async () => {
    vi.mocked(api.get).mockImplementation(() => Promise.reject(new Error("boom")));
    render(<CreateSegmentModal open={true} onOpenChange={vi.fn()} onCreated={vi.fn()} />);
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("Grupos")).not.toBeInTheDocument();
    expect(screen.queryByText("Ministérios")).not.toBeInTheDocument();
  });

  it("submits the segment with selected criteria and shows success", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({ data: {} });
    const onCreated = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <CreateSegmentModal open={true} onOpenChange={onOpenChange} onCreated={onCreated} />
    );

    await screen.findByText("Célula Alfa");
    await user.type(screen.getByLabelText(/Nome/), "Jovens");
    await user.click(screen.getByLabelText("Célula Alfa"));
    await user.click(screen.getByLabelText("Líder"));
    await user.type(screen.getByLabelText("Idade mínima"), "18");
    await user.type(screen.getByLabelText("Idade máxima"), "35");

    await user.click(screen.getByRole("button", { name: "Criar segmento" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/content/segments", {
        name: "Jovens",
        criteria: {
          group_ids: ["g1"],
          roles: ["leader"],
          min_age: 18,
          max_age: 35,
        },
      })
    );

    expect(await screen.findByText("Segmento criado!")).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(1200);

    expect(onCreated).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    vi.useRealTimers();
  });

  it("shows an error message when the API call fails", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockRejectedValue(new Error("fail"));

    render(<CreateSegmentModal open={true} onOpenChange={vi.fn()} onCreated={vi.fn()} />);
    await screen.findByText("Célula Alfa");

    await user.type(screen.getByLabelText(/Nome/), "Jovens");
    await user.click(screen.getByRole("button", { name: "Criar segmento" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Erro ao criar segmento. Tente novamente."
    );
  });
});
