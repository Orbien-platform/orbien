import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarBadge,
  AvatarImage,
} from "./avatar";

describe("Avatar", () => {
  it("renderiza o fallback com as iniciais", () => {
    render(
      <Avatar>
        <AvatarFallback>AB</AvatarFallback>
      </Avatar>
    );
    expect(screen.getByText("AB")).toBeInTheDocument();
  });

  it("expõe data-size no root para variantes de tamanho", () => {
    const { container } = render(
      <Avatar size="lg">
        <AvatarFallback>LG</AvatarFallback>
      </Avatar>
    );
    expect(container.querySelector('[data-slot="avatar"]')).toHaveAttribute(
      "data-size",
      "lg"
    );
  });

  it("usa 'default' como tamanho padrão", () => {
    const { container } = render(
      <Avatar>
        <AvatarFallback>DF</AvatarFallback>
      </Avatar>
    );
    expect(container.querySelector('[data-slot="avatar"]')).toHaveAttribute(
      "data-size",
      "default"
    );
  });

  it("AvatarBadge renderiza como span com o slot certo", () => {
    render(<AvatarBadge data-testid="badge" />);
    expect(screen.getByTestId("badge")).toHaveAttribute(
      "data-slot",
      "avatar-badge"
    );
  });

  describe("AvatarImage", () => {
    const OriginalImage = window.Image;

    afterEach(() => {
      window.Image = OriginalImage;
    });

    it("renderiza a imagem quando o carregamento é bem-sucedido", () => {
      class FakeImage {
        complete = true;
        naturalWidth = 1;
      }
      // @ts-expect-error -- stub simplificado só para o fast-path de "complete" do base-ui
      window.Image = FakeImage;

      const { container } = render(
        <Avatar>
          <AvatarImage src="https://example.com/a.png" alt="Ana" />
        </Avatar>
      );
      const img = container.querySelector('[data-slot="avatar-image"]');
      expect(img).not.toBeNull();
      expect(img?.className).toContain("rounded-full");
    });
  });

  it("AvatarGroup agrupa vários avatares", () => {
    const { container } = render(
      <AvatarGroup>
        <Avatar>
          <AvatarFallback>A</AvatarFallback>
        </Avatar>
        <Avatar>
          <AvatarFallback>B</AvatarFallback>
        </Avatar>
        <AvatarGroupCount>+3</AvatarGroupCount>
      </AvatarGroup>
    );
    expect(container.querySelectorAll('[data-slot="avatar"]')).toHaveLength(2);
    expect(screen.getByText("+3")).toBeInTheDocument();
  });
});
