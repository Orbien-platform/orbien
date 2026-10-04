// Testes derivados do Done-when de T18 (tasks.md, biblia-nvi-marcacoes-mobile,
// BIB-01): abre o picker, navega para /biblia/[book]/[chapter] ao
// confirmar, e tem atalho visível para o feed.
import { act, fireEvent, render, screen } from "@testing-library/react-native";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

// O picker tem testes próprios (BookChapterPickerModal.test.tsx); aqui só
// importa que a tela abre ele e reage ao callback com o valor certo.
jest.mock("../../../components/BookChapterPickerModal", () => {
  const { Text, Pressable } = require("react-native");
  return {
    BookChapterPickerModal: ({
      visible,
      onClose,
      onSelect,
    }: {
      visible: boolean;
      onClose: () => void;
      onSelect: (bookCode: string, chapter: number) => void;
    }) =>
      visible ? (
        <>
          <Pressable testID="mock-picker" onPress={() => onSelect("JHN", 3)}>
            <Text>picker aberto</Text>
          </Pressable>
          <Pressable testID="mock-picker-close" onPress={onClose}>
            <Text>fechar</Text>
          </Pressable>
        </>
      ) : null,
  };
});

import BibliaScreen from "../../../app/biblia/index";

describe("BibliaScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("abre o picker ao tocar em 'Escolher livro e capítulo'", async () => {
    await act(async () => {
      render(<BibliaScreen />);
    });

    expect(screen.queryByTestId("mock-picker")).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByTestId("biblia-open-picker"));
    });

    expect(screen.getByTestId("mock-picker")).toBeTruthy();
  });

  it("confirmar livro e capítulo no picker navega para /biblia/[book]/[chapter]", async () => {
    await act(async () => {
      render(<BibliaScreen />);
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId("biblia-open-picker"));
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId("mock-picker"));
    });

    expect(mockPush).toHaveBeenCalledWith("/biblia/JHN/3");
  });

  it("mostra o atalho para o feed e navega para /biblia/feed ao tocar", async () => {
    await act(async () => {
      render(<BibliaScreen />);
    });

    expect(screen.getByTestId("biblia-feed-shortcut")).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId("biblia-feed-shortcut"));
    });

    expect(mockPush).toHaveBeenCalledWith("/biblia/feed");
  });
  it("fechar o picker o esconde sem navegar", async () => {
    await render(<BibliaScreen />);
    await act(async () => {
      fireEvent.press(screen.getByTestId("biblia-open-picker"));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("mock-picker-close"));
    });

    expect(screen.queryByTestId("mock-picker")).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
