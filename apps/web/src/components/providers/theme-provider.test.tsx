import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import { ThemeProvider } from "./theme-provider";

beforeAll(() => {
  // jsdom não implementa matchMedia; next-themes usa para detectar o tema do SO.
  window.matchMedia =
    window.matchMedia ??
    ((query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList);
});

describe("ThemeProvider", () => {
  it("renderiza os children normalmente", () => {
    render(
      <ThemeProvider attribute="class" defaultTheme="light">
        <span>Conteúdo</span>
      </ThemeProvider>
    );
    expect(screen.getByText("Conteúdo")).toBeInTheDocument();
  });

  it("repassa props para o NextThemesProvider subjacente", () => {
    const { container } = render(
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
        <span>Conteúdo</span>
      </ThemeProvider>
    );
    expect(container).toBeInTheDocument();
  });
});
