import { render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import api from "@/lib/api";
import { GroupHealthSummary } from "./GroupHealthSummary";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn() } }));

describe("GroupHealthSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("mostra a contagem de cada cor, com o link para a lista", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { green: 3, yellow: 2, red: 1, total: 6 } });

    render(<GroupHealthSummary />);

    expect(await screen.findByTestId("group-health-summary")).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/small-groups/health-summary");
    expect(within(screen.getByTestId("group-health-green")).getByText("3")).toBeInTheDocument();
    expect(within(screen.getByTestId("group-health-yellow")).getByText("2")).toBeInTheDocument();
    expect(within(screen.getByTestId("group-health-red")).getByText("1")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /ver lista/i })).toHaveAttribute("href", "/grupos");
  });

  it("sem células, não renderiza nada", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { green: 0, yellow: 0, red: 0, total: 0 } });

    const { container } = render(<GroupHealthSummary />);

    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("em 403 (Starter ou outro papel) ou falha qualquer, some em silêncio", async () => {
    vi.mocked(api.get).mockRejectedValue({ response: { status: 403 } });

    const { container } = render(<GroupHealthSummary />);

    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("resposta que chega depois de desmontar é ignorada", async () => {
    let resolve!: (v: unknown) => void;
    vi.mocked(api.get).mockReturnValue(new Promise((r) => (resolve = r)) as never);

    const { unmount } = render(<GroupHealthSummary />);
    unmount();
    resolve({ data: { green: 1, yellow: 0, red: 0, total: 1 } });

    await Promise.resolve();
    expect(screen.queryByTestId("group-health-summary")).toBeNull();
  });

  it("falha que chega depois de desmontar também é ignorada", async () => {
    let reject!: (e: unknown) => void;
    vi.mocked(api.get).mockReturnValue(new Promise((_, r) => (reject = r)) as never);

    const { unmount } = render(<GroupHealthSummary />);
    unmount();
    reject(new Error("offline"));

    await Promise.resolve();
    expect(screen.queryByTestId("group-health-summary")).toBeNull();
  });
});
