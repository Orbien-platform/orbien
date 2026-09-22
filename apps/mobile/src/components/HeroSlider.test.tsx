// Testes derivados de T9 (.specs/features/mobile-home-redesign/tasks.md,
// Done-when) e MHR-05/06 (spec.md): renderiza um card por post (0/1/N),
// lista vazia não quebra a Home (retorna `null`), toque dispara
// `onPressPost` com o id certo.
import { act, fireEvent, render, screen } from "@testing-library/react-native";

import type { Post } from "../lib/content/types";
import { HeroSlider } from "./HeroSlider";

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: "post-1",
    type: "post",
    title: "Título do post",
    body: null,
    media_url: null,
    published_at: "2026-09-01T12:00:00.000Z",
    created_at: "2026-09-01T12:00:00.000Z",
    ...overrides,
  };
}

describe("HeroSlider", () => {
  it("lista vazia: não renderiza nada (MHR-06)", async () => {
    let result: Awaited<ReturnType<typeof render>> | undefined;
    await act(async () => {
      result = await render(<HeroSlider posts={[]} onPressPost={jest.fn()} />);
    });

    expect(result?.toJSON()).toBeNull();
  });

  it("um post: renderiza um card para o item (MHR-05)", async () => {
    await act(async () => {
      render(<HeroSlider posts={[makePost()]} onPressPost={jest.fn()} />);
    });

    expect(screen.getByTestId("hero-slide-post-1")).toBeTruthy();
  });

  it("N posts: renderiza um card por post, na ordem recebida (MHR-05)", async () => {
    const posts = [
      makePost({ id: "post-1" }),
      makePost({ id: "post-2" }),
      makePost({ id: "post-3" }),
    ];
    await act(async () => {
      render(<HeroSlider posts={posts} onPressPost={jest.fn()} />);
    });

    expect(screen.getByTestId("hero-slide-post-1")).toBeTruthy();
    expect(screen.getByTestId("hero-slide-post-2")).toBeTruthy();
    expect(screen.getByTestId("hero-slide-post-3")).toBeTruthy();
  });

  it("toque num item do hero chama onPressPost com o id do post tocado (MHR-05)", async () => {
    const onPressPost = jest.fn();
    const posts = [makePost({ id: "post-1" }), makePost({ id: "post-2" })];
    await act(async () => {
      render(<HeroSlider posts={posts} onPressPost={onPressPost} />);
    });

    fireEvent.press(screen.getByTestId("hero-slide-post-2"));

    expect(onPressPost).toHaveBeenCalledTimes(1);
    expect(onPressPost).toHaveBeenCalledWith("post-2");
  });
});
