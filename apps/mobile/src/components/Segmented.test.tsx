import { fireEvent, render, screen } from "@testing-library/react-native";

import { Segmented } from "./Segmented";

describe("Segmented", () => {
  it("marca a aba ativa, mostra a contagem e troca ao tocar", async () => {
    const onChange = jest.fn();
    await render(
      <Segmented
        testID="abas"
        value="a"
        onChange={onChange}
        segments={[
          { value: "a", label: "Próximas" },
          { value: "b", label: "Trocas", count: 2 },
          { value: "c", label: "Meu perfil", count: 0 },
        ]}
      />,
    );

    expect(screen.getByTestId("abas-a").props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByLabelText("Trocas, 2 pendentes")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByLabelText("Meu perfil")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("abas-b"));
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("sem testID, os segmentos ficam sem testID", async () => {
    await render(
      <Segmented value="a" onChange={jest.fn()} segments={[{ value: "a", label: "Única" }]} />,
    );
    expect(screen.getByRole("tab").props.testID).toBeUndefined();
  });
});
