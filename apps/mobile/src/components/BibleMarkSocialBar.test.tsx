// Curtir/responder: rótulo das respostas no singular e no plural, sem
// contador quando não há onde abrir, e um toque de curtida por vez.
import { act, fireEvent, render, screen } from "@testing-library/react-native";

const mockLikeMark = jest.fn();
jest.mock("../lib/bible/bible-client", () => ({
  likeMark: (...args: unknown[]) => mockLikeMark(...args),
  unlikeMark: jest.fn(),
}));

import { BibleMarkSocialBar } from "./BibleMarkSocialBar";

const MARK = { id: "m1", like_count: 0, liked_by_me: false, reply_count: 0 };

describe("BibleMarkSocialBar", () => {
  beforeEach(() => jest.clearAllMocks());

  it("sem respostas convida a responder; com uma, singular", async () => {
    const view = await render(
      <BibleMarkSocialBar mark={MARK} onLikeChange={jest.fn()} onOpenReplies={jest.fn()} />,
    );
    expect(screen.getByTestId("biblia-mark-replies-m1")).toHaveTextContent("Responder");
    expect(screen.getByTestId("biblia-mark-like-count-m1")).toHaveTextContent("Curtir");

    await view.rerender(
      <BibleMarkSocialBar
        mark={{ ...MARK, reply_count: 1 }}
        onLikeChange={jest.fn()}
        onOpenReplies={jest.fn()}
      />,
    );
    expect(screen.getByTestId("biblia-mark-replies-m1")).toHaveTextContent("1 resposta");
  });

  it("sem onOpenReplies, não mostra o contador de respostas", async () => {
    await render(<BibleMarkSocialBar mark={MARK} onLikeChange={jest.fn()} />);
    expect(screen.queryByTestId("biblia-mark-replies-m1")).toBeNull();
  });

  it("segundo toque com a curtida no ar é ignorado", async () => {
    mockLikeMark.mockReturnValue(new Promise(() => {}));
    await render(<BibleMarkSocialBar mark={MARK} onLikeChange={jest.fn()} />);

    await act(async () => {
      fireEvent.press(screen.getByTestId("biblia-mark-like-m1"));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("biblia-mark-like-m1"));
    });

    expect(mockLikeMark).toHaveBeenCalledTimes(1);
  });
});
