import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SendNotificationModal } from "./SendNotificationModal";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

const segments = [{ id: "s1", name: "Jovens" }];

describe("SendNotificationModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockResolvedValue({ data: { data: segments } });
  });

  it("does not render form fields when closed", () => {
    render(<SendNotificationModal open={false} onOpenChange={vi.fn()} onSent={vi.fn()} />);
    expect(screen.queryByText("Enviar notificação")).not.toBeInTheDocument();
  });

  it("loads segments and validates required title and message", async () => {
    const user = userEvent.setup();
    render(<SendNotificationModal open={true} onOpenChange={vi.fn()} onSent={vi.fn()} />);

    expect(await screen.findByText("Jovens")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Enviar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Título é obrigatório.");

    await user.type(screen.getByLabelText(/Título/), "Convite");
    await user.click(screen.getByRole("button", { name: "Enviar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Mensagem é obrigatória.");
  });

  it("toggles a segment checkbox on and off (deselect branch)", async () => {
    const user = userEvent.setup();
    render(<SendNotificationModal open={true} onOpenChange={vi.fn()} onSent={vi.fn()} />);
    await screen.findByText("Jovens");

    const checkbox = screen.getByLabelText("Jovens");
    await user.click(checkbox);
    expect(checkbox).toBeChecked();
    await user.click(checkbox);
    expect(checkbox).not.toBeChecked();
  });

  it("cancels via the Cancelar button and closes via the modal's own close button", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<SendNotificationModal open={true} onOpenChange={onOpenChange} onSent={vi.fn()} />);
    await screen.findByText("Jovens");

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);

    await user.click(screen.getByRole("button", { name: "Fechar" }));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it("sends the notification and shows the delivered count", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({ data: { delivered: 42 } });
    const onSent = vi.fn();

    render(<SendNotificationModal open={true} onOpenChange={vi.fn()} onSent={onSent} />);
    await screen.findByText("Jovens");

    await user.type(screen.getByLabelText(/Título/), "Convite");
    await user.type(screen.getByLabelText(/Mensagem/), "Venha ao culto");
    await user.click(screen.getByLabelText("Jovens"));
    await user.click(screen.getByRole("button", { name: "Enviar" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/content/notifications/send", {
        title: "Convite",
        message: "Venha ao culto",
        segment_ids: ["s1"],
      })
    );

    expect(await screen.findByText("Notificação enviada!")).toBeInTheDocument();
    expect(screen.getByText("42 entregue(s)")).toBeInTheDocument();
    expect(onSent).toHaveBeenCalledWith({ delivered: 42 });
  });

  it("handles a flat array response for segments (no pagination wrapper)", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: segments });
    render(<SendNotificationModal open={true} onOpenChange={vi.fn()} onSent={vi.fn()} />);
    expect(await screen.findByText("Jovens")).toBeInTheDocument();
  });

  it("defaults to an empty segment list when the paginated response has no data field", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: {} });
    render(<SendNotificationModal open={true} onOpenChange={vi.fn()} onSent={vi.fn()} />);
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(screen.queryByText("Segmentos")).not.toBeInTheDocument();
  });

  it("silently ignores a failed segments fetch", async () => {
    vi.mocked(api.get).mockRejectedValue(new Error("boom"));
    render(<SendNotificationModal open={true} onOpenChange={vi.fn()} onSent={vi.fn()} />);
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(screen.queryByText("Segmentos")).not.toBeInTheDocument();
  });

  it("shows no delivered count and passes delivered: undefined when the API returns neither field", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({ data: {} });
    const onSent = vi.fn();

    render(<SendNotificationModal open={true} onOpenChange={vi.fn()} onSent={onSent} />);
    await screen.findByText("Jovens");

    await user.type(screen.getByLabelText(/Título/), "Convite");
    await user.type(screen.getByLabelText(/Mensagem/), "Venha ao culto");
    await user.click(screen.getByRole("button", { name: "Enviar" }));

    expect(await screen.findByText("Notificação enviada!")).toBeInTheDocument();
    expect(screen.queryByText(/entregue\(s\)/)).not.toBeInTheDocument();
    expect(onSent).toHaveBeenCalledWith({ delivered: undefined });
  });

  it("falls back to the count field when delivered is absent", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({ data: { count: 7 } });

    render(<SendNotificationModal open={true} onOpenChange={vi.fn()} onSent={vi.fn()} />);
    await screen.findByText("Jovens");

    await user.type(screen.getByLabelText(/Título/), "Convite");
    await user.type(screen.getByLabelText(/Mensagem/), "Venha ao culto");
    await user.click(screen.getByRole("button", { name: "Enviar" }));

    expect(await screen.findByText("7 entregue(s)")).toBeInTheDocument();
  });

  it("closes and resets after clicking Fechar on the success screen", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({ data: { delivered: 1 } });
    const onOpenChange = vi.fn();

    render(<SendNotificationModal open={true} onOpenChange={onOpenChange} onSent={vi.fn()} />);
    await screen.findByText("Jovens");

    await user.type(screen.getByLabelText(/Título/), "Convite");
    await user.type(screen.getByLabelText(/Mensagem/), "Venha ao culto");
    await user.click(screen.getByRole("button", { name: "Enviar" }));

    await screen.findByText("Notificação enviada!");
    const closeButtons = screen.getAllByRole("button", { name: "Fechar" });
    await user.click(closeButtons[closeButtons.length - 1]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows an error message when the API call fails", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockRejectedValue(new Error("fail"));

    render(<SendNotificationModal open={true} onOpenChange={vi.fn()} onSent={vi.fn()} />);
    await screen.findByText("Jovens");

    await user.type(screen.getByLabelText(/Título/), "Convite");
    await user.type(screen.getByLabelText(/Mensagem/), "Venha ao culto");
    await user.click(screen.getByRole("button", { name: "Enviar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Erro ao enviar notificação. Tente novamente."
    );
  });
});
