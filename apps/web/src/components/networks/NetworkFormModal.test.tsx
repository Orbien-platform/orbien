import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NetworkFormModal } from "./NetworkFormModal";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));

const persons = [
  { id: "p1", full_name: "Ana Souza" },
  { id: "p2", full_name: "Bruno Lima" },
];

describe("NetworkFormModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockResolvedValue({ data: { data: persons, total: 2 } });
  });

  it("does not render form fields when closed", () => {
    render(
      <NetworkFormModal open={false} onOpenChange={vi.fn()} network={null} onSaved={vi.fn()} />
    );
    expect(screen.queryByText("Nova rede")).not.toBeInTheDocument();
  });

  it("shows 'Nova rede' title when creating (network with null id)", async () => {
    render(
      <NetworkFormModal
        open={true}
        onOpenChange={vi.fn()}
        network={{ id: null, name: "", leader_person_id: null, health_goal_pct: null }}
        onSaved={vi.fn()}
      />
    );
    expect(await screen.findByText("Nova rede")).toBeInTheDocument();
  });

  it("shows 'Editar rede' and pre-fills the form when editing", async () => {
    render(
      <NetworkFormModal
        open={true}
        onOpenChange={vi.fn()}
        network={{ id: "n1", name: "Rede Central", leader_person_id: "p1", health_goal_pct: 80 }}
        onSaved={vi.fn()}
      />
    );
    expect(await screen.findByText("Editar rede")).toBeInTheDocument();
    expect(screen.getByLabelText(/Nome/)).toHaveValue("Rede Central");
    await waitFor(() => expect(screen.getByLabelText(/Meta de saúde/)).toHaveValue(80));
  });

  it("requires a name before submitting", async () => {
    const user = userEvent.setup();
    render(
      <NetworkFormModal
        open={true}
        onOpenChange={vi.fn()}
        network={{ id: null, name: "", leader_person_id: null, health_goal_pct: null }}
        onSaved={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Nome é obrigatório.");
  });

  it("rejects a health_goal_pct outside 0-100", async () => {
    const user = userEvent.setup();
    render(
      <NetworkFormModal
        open={true}
        onOpenChange={vi.fn()}
        network={{ id: null, name: "", leader_person_id: null, health_goal_pct: null }}
        onSaved={vi.fn()}
      />
    );

    await user.type(screen.getByLabelText(/Nome/), "Rede Central");
    await user.type(screen.getByLabelText(/Meta de saúde/), "150");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Meta deve ser um número inteiro entre 0 e 100."
    );
    expect(api.post).not.toHaveBeenCalled();
  });

  it("creates a network via POST /networks", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { id: "n1" } });
    const onSaved = vi.fn();
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    render(
      <NetworkFormModal
        open={true}
        onOpenChange={onOpenChange}
        network={{ id: null, name: "", leader_person_id: null, health_goal_pct: null }}
        onSaved={onSaved}
      />
    );

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/persons?limit=100"));
    await user.type(screen.getByLabelText(/Nome/), "Rede Central");
    await user.selectOptions(screen.getByLabelText(/Líder de rede/), "p1");
    await user.type(screen.getByLabelText(/Meta de saúde/), "80");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/networks", {
        name: "Rede Central",
        leader_person_id: "p1",
        health_goal_pct: 80,
      })
    );
    expect(onSaved).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("updates a network via PATCH /networks/:id when editing", async () => {
    vi.mocked(api.patch).mockResolvedValue({ data: {} });
    const onSaved = vi.fn();
    const user = userEvent.setup();

    render(
      <NetworkFormModal
        open={true}
        onOpenChange={vi.fn()}
        network={{ id: "n1", name: "Rede Central", leader_person_id: null, health_goal_pct: null }}
        onSaved={onSaved}
      />
    );

    await user.clear(screen.getByLabelText(/Nome/));
    await user.type(screen.getByLabelText(/Nome/), "Rede Renomeada");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith("/networks/n1", {
        name: "Rede Renomeada",
        leader_person_id: null,
        health_goal_pct: null,
      })
    );
    expect(onSaved).toHaveBeenCalled();
  });

  it("sends null (not undefined) when clearing the leader and health goal on an existing network", async () => {
    vi.mocked(api.patch).mockResolvedValue({ data: {} });
    const user = userEvent.setup();

    render(
      <NetworkFormModal
        open={true}
        onOpenChange={vi.fn()}
        network={{ id: "n1", name: "Rede Central", leader_person_id: "p1", health_goal_pct: 80 }}
        onSaved={vi.fn()}
      />
    );

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/persons?limit=100"));
    await user.selectOptions(screen.getByLabelText(/Líder de rede/), "");
    await user.clear(screen.getByLabelText(/Meta de saúde/));
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith("/networks/n1", {
        name: "Rede Central",
        leader_person_id: null,
        health_goal_pct: null,
      })
    );
  });

  it("shows a generic error message when the create request fails", async () => {
    vi.mocked(api.post).mockRejectedValue(new Error("boom"));
    const user = userEvent.setup();

    render(
      <NetworkFormModal
        open={true}
        onOpenChange={vi.fn()}
        network={{ id: null, name: "", leader_person_id: null, health_goal_pct: null }}
        onSaved={vi.fn()}
      />
    );

    await user.type(screen.getByLabelText(/Nome/), "Rede Central");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Erro ao criar rede.");
  });

  it("cancel button closes without submitting", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(
      <NetworkFormModal
        open={true}
        onOpenChange={onOpenChange}
        network={{ id: null, name: "", leader_person_id: null, health_goal_pct: null }}
        onSaved={vi.fn()}
      />
    );

    await user.type(screen.getByLabelText(/Nome/), "Rascunho");
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(api.post).not.toHaveBeenCalled();
  });
});
