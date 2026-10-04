import { act, fireEvent, render, screen } from "@testing-library/react-native";

import { ChoiceChips } from "../../components/ChoiceChips";

describe("ChoiceChips", () => {
  it("marca a escolhida e avisa a troca", async () => {
    const onChange = jest.fn();
    await act(async () => {
      render(
        <ChoiceChips
          testID="c"
          value="a"
          onChange={onChange}
          options={[
            { value: "a", label: "A" },
            { value: "b", label: "B" },
          ]}
        />,
      );
    });

    expect(screen.getByTestId("c-a").props.accessibilityState).toEqual({ checked: true });
    expect(screen.getByTestId("c-b").props.accessibilityState).toEqual({ checked: false });

    await act(async () => {
      fireEvent.press(screen.getByTestId("c-b"));
    });
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("funciona sem testID e sem escolha prévia", async () => {
    await act(async () => {
      render(<ChoiceChips value={null} onChange={jest.fn()} options={[{ value: "a", label: "A" }]} />);
    });
    expect(screen.getByText("A")).toBeTruthy();
  });
});
