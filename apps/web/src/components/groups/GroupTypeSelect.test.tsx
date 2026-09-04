import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { GroupTypeSelect } from "./GroupTypeSelect";

const types = [
  { id: "gt1", name: "Célula", color: "#111111", is_active: true },
  { id: "gt2", name: "Núcleo", color: null, is_active: true },
];

describe("GroupTypeSelect", () => {
  it("shows the placeholder when nothing is selected", () => {
    render(
      <GroupTypeSelect types={types} value="" onValueChange={vi.fn()} />
    );
    expect(screen.getByText("— Selecione o tipo —")).toBeInTheDocument();
  });

  it("shows a custom placeholder when provided", () => {
    render(
      <GroupTypeSelect
        types={types}
        value=""
        onValueChange={vi.fn()}
        placeholder="Escolha um tipo"
      />
    );
    expect(screen.getByText("Escolha um tipo")).toBeInTheDocument();
  });

  it("shows the selected type name and its color dot", () => {
    render(
      <GroupTypeSelect types={types} value="gt1" onValueChange={vi.fn()} />
    );
    expect(screen.getByText("Célula")).toBeInTheDocument();
  });

  it("falls back to the default color when the type has no color", () => {
    render(
      <GroupTypeSelect types={types} value="gt2" onValueChange={vi.fn()} />
    );
    expect(screen.getByText("Núcleo")).toBeInTheDocument();
  });

  it("lists all options and calls onValueChange when one is picked", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <GroupTypeSelect types={types} value="" onValueChange={onValueChange} />
    );

    await user.click(screen.getByRole("combobox"));
    expect(await screen.findByRole("option", { name: "Célula" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Núcleo" })).toBeInTheDocument();

    await user.click(screen.getByRole("option", { name: "Núcleo" }));
    expect(onValueChange).toHaveBeenCalledWith("gt2");
  });

  it("is disabled when the disabled prop is passed", () => {
    render(
      <GroupTypeSelect types={types} value="" onValueChange={vi.fn()} disabled />
    );
    expect(screen.getByRole("combobox")).toBeDisabled();
  });

  it("is disabled when there are no types", () => {
    render(<GroupTypeSelect types={[]} value="" onValueChange={vi.fn()} />);
    expect(screen.getByRole("combobox")).toBeDisabled();
  });
});
