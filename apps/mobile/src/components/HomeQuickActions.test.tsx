// Testes derivados de T10 (.specs/features/mobile-home-redesign/tasks.md,
// Done-when) e MHR-07/08/09/11 (spec.md): renderiza N itens, toque em
// item habilitado chama `onPress`, toque em item `disabled` não chama.
import { act, fireEvent, render, screen } from "@testing-library/react-native";

import { Check } from "../lib/theme/icons";
import { HomeQuickActions, type QuickAction } from "./HomeQuickActions";

function makeItem(overrides: Partial<QuickAction> = {}): QuickAction {
  return {
    key: "biblia",
    label: "Bíblia",
    icon: Check,
    onPress: jest.fn(),
    ...overrides,
  };
}

describe("HomeQuickActions", () => {
  it("renderiza um item tocável por QuickAction recebido", async () => {
    const items = [
      makeItem({ key: "biblia", label: "Bíblia" }),
      makeItem({ key: "contribuicao", label: "Contribuição" }),
      makeItem({ key: "conteudo", label: "Ver todos os conteúdos" }),
    ];

    await act(async () => {
      render(<HomeQuickActions items={items} />);
    });

    expect(screen.getByTestId("quick-action-biblia")).toBeTruthy();
    expect(screen.getByTestId("quick-action-contribuicao")).toBeTruthy();
    expect(screen.getByTestId("quick-action-conteudo")).toBeTruthy();
  });

  it("toque em item habilitado chama onPress", async () => {
    const onPress = jest.fn();
    const items = [makeItem({ key: "biblia", onPress })];

    await act(async () => {
      render(<HomeQuickActions items={items} />);
    });

    fireEvent.press(screen.getByTestId("quick-action-biblia"));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("toque em item disabled não chama onPress (MHR-11)", async () => {
    const onPress = jest.fn();
    const items = [makeItem({ key: "contribuicao", onPress, disabled: true })];

    await act(async () => {
      render(<HomeQuickActions items={items} />);
    });

    fireEvent.press(screen.getByTestId("quick-action-contribuicao"));

    expect(onPress).not.toHaveBeenCalled();
  });

  it("item disabled fica visualmente inativo (accessibilityState.disabled ausente, sem role de botão pressionável)", async () => {
    const items = [makeItem({ key: "contribuicao", disabled: true })];

    await act(async () => {
      render(<HomeQuickActions items={items} />);
    });

    const element = screen.getByTestId("quick-action-contribuicao");
    // Card sem onPress renderiza como View simples (Card.tsx) — sem
    // accessibilityRole="button", que só existe na variante Pressable.
    expect(element.props.accessibilityRole).toBeUndefined();
  });
});
