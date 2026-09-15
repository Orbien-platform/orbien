import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GroupHealthBadge } from "./GroupHealthBadge";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn() },
}));

describe("GroupHealthBadge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("mostra a bolinha verde com o tooltip de dias desde a última reunião", async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: { status: "green", last_meeting_at: "2026-09-10T00:00:00.000Z", days_since_last_meeting: 5 },
    });

    render(<GroupHealthBadge groupId="sg1" />);

    const dot = await screen.findByRole("status");
    expect(dot).toHaveClass("bg-teal");
    expect(dot).toHaveAttribute("title", "Última reunião há 5 dias");
  });

  it("mostra a bolinha amarela", async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: { status: "yellow", last_meeting_at: "2026-08-25T00:00:00.000Z", days_since_last_meeting: 21 },
    });

    render(<GroupHealthBadge groupId="sg1" />);

    const dot = await screen.findByRole("status");
    expect(dot).toHaveClass("bg-amber-500");
  });

  it("mostra a bolinha vermelha e o tooltip de 'nunca se reuniu' quando days_since_last_meeting é null", async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: { status: "red", last_meeting_at: null, days_since_last_meeting: null },
    });

    render(<GroupHealthBadge groupId="sg1" />);

    const dot = await screen.findByRole("status");
    expect(dot).toHaveClass("bg-crimson");
    expect(dot).toHaveAttribute("title", "Nunca se reuniu");
  });

  it("oculta silenciosamente em 403 (sem Premium) — sem erro visível", async () => {
    vi.mocked(api.get).mockRejectedValue({ response: { status: 403 } });

    render(<GroupHealthBadge groupId="sg1" />);

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/small-groups/sg1/health"));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByText(/./)).not.toBeInTheDocument();
  });

  it("oculta silenciosamente em qualquer outra falha de rede", async () => {
    vi.mocked(api.get).mockRejectedValue(new Error("network down"));

    render(<GroupHealthBadge groupId="sg1" />);

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/small-groups/sg1/health"));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("recarrega ao trocar de groupId", async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: { status: "green", last_meeting_at: null, days_since_last_meeting: 2 },
    });

    const { rerender } = render(<GroupHealthBadge groupId="sg1" />);
    await screen.findByRole("status");

    rerender(<GroupHealthBadge groupId="sg2" />);
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/small-groups/sg2/health"));
  });
});
