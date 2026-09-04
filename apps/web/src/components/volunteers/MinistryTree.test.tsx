import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { MinistryTree } from "./MinistryTree";

const nodes = [
  {
    id: "mn1",
    name: "Louvor",
    description: "Ministério de música",
    color: "#123456",
    children: [
      { id: "mn1a", name: "Backing vocals", description: null, color: null, children: [] },
    ],
  },
  { id: "mn2", name: "Recepção", description: null, color: null, children: [] },
];

describe("MinistryTree", () => {
  it("renders the top-level and nested ministries with their names and descriptions", () => {
    render(<MinistryTree nodes={nodes} counts={{}} onSelect={vi.fn()} />);

    expect(screen.getByText("Louvor")).toBeInTheDocument();
    expect(screen.getByText("Ministério de música")).toBeInTheDocument();
    expect(screen.getByText("Backing vocals")).toBeInTheDocument();
    expect(screen.getByText("Recepção")).toBeInTheDocument();
  });

  it("shows leader/volunteer counts, falling back to zero when missing", () => {
    render(
      <MinistryTree
        nodes={nodes}
        counts={{ mn1: { leaders: 2, volunteers: 5 } }}
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByText("2 líderes")).toBeInTheDocument();
    expect(screen.getByText("5 voluntários")).toBeInTheDocument();
    expect(screen.getAllByText("0 líderes").length).toBeGreaterThan(0);
    expect(screen.getAllByText("0 voluntários").length).toBeGreaterThan(0);
  });

  it("calls onSelect with the node id when a row is clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<MinistryTree nodes={nodes} counts={{}} onSelect={onSelect} />);

    await user.click(screen.getByText("Backing vocals").closest("button")!);
    expect(onSelect).toHaveBeenCalledWith("mn1a");

    await user.click(screen.getByText("Recepção").closest("button")!);
    expect(onSelect).toHaveBeenCalledWith("mn2");
  });

  it("indents child rows relative to their depth", () => {
    render(<MinistryTree nodes={nodes} counts={{}} onSelect={vi.fn()} />);
    const childButton = screen.getByText("Backing vocals").closest("button")!;
    expect(childButton).toHaveStyle({ marginLeft: "24px" });
  });

  it("uses the singular form when there is exactly one leader or volunteer", () => {
    render(
      <MinistryTree
        nodes={nodes}
        counts={{ mn1: { leaders: 1, volunteers: 1 } }}
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByText("1 líder")).toBeInTheDocument();
    expect(screen.getByText("1 voluntário")).toBeInTheDocument();
  });
});
