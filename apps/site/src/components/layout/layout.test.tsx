import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Footer } from "./Footer";
import { Header } from "./Header";
import { NavDropdown } from "./NavDropdown";

afterEach(() => {
  vi.useRealTimers();
});

describe("Header", () => {
  it("leva a marca para a raiz e traz os três links de navegação", () => {
    render(<Header />);

    expect(screen.getByRole("link", { name: /Orbien/ })).toHaveAttribute(
      "href",
      "/"
    );
    const nav = screen.getByRole("navigation", { name: "Principal" });
    expect(within(nav).getByRole("link", { name: "Preços" })).toHaveAttribute(
      "href",
      "/precos"
    );
    expect(within(nav).getByRole("link", { name: "Sem CNPJ" })).toHaveAttribute(
      "href",
      "/sem-cnpj"
    );
    expect(within(nav).getByRole("link", { name: "Sobre" })).toHaveAttribute(
      "href",
      "/sobre"
    );
  });

  it("traz as ações de entrar e de lista de espera", () => {
    render(<Header />);

    expect(screen.getByRole("link", { name: "Entrar" })).toHaveAttribute(
      "href",
      "/entrar"
    );
    expect(
      screen.getByRole("link", { name: "Lista de espera" })
    ).toHaveAttribute("href", "#waitlist");
    expect(screen.getByRole("button", { name: "Abrir menu" })).toBeInTheDocument();
  });
});

describe("NavDropdown", () => {
  // O painel abre no `mouseenter` e o clique alterna. Como `user.click`
  // dispara o hover antes do clique, um clique com o mouse por cima
  // FECHA — é o comportamento real no browser, e os testes seguem essa
  // ordem em vez de contorná-la.
  async function abrir(user: ReturnType<typeof userEvent.setup>) {
    await user.hover(screen.getByRole("button", { name: /Funcionalidades/ }));
  }

  it("começa fechado e abre ao passar o mouse", async () => {
    const user = userEvent.setup();
    render(<NavDropdown />);

    const gatilho = screen.getByRole("button", { name: /Funcionalidades/ });
    expect(gatilho).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("4 módulos disponíveis")).not.toBeInTheDocument();

    await abrir(user);

    expect(gatilho).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: /Membros/ })).toHaveAttribute(
      "href",
      "/funcionalidades/membros"
    );
    expect(screen.getByRole("link", { name: /Financeiro/ })).toHaveAttribute(
      "href",
      "/funcionalidades/financeiro"
    );
    expect(
      screen.getByRole("link", { name: /Pequenos Grupos/ })
    ).toHaveAttribute("href", "/funcionalidades/pequenos-grupos");
    expect(screen.getByRole("link", { name: /Conteúdos/ })).toHaveAttribute(
      "href",
      "/funcionalidades/conteudos"
    );
    expect(screen.getByText("4 módulos disponíveis")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver todos →" })).toHaveAttribute(
      "href",
      "/funcionalidades"
    );
  });

  it("o clique alterna a partir do que o hover deixou", async () => {
    const user = userEvent.setup();
    render(<NavDropdown />);
    const gatilho = screen.getByRole("button", { name: /Funcionalidades/ });

    // Com o mouse já em cima (aberto), o clique fecha.
    await user.click(gatilho);
    expect(gatilho).toHaveAttribute("aria-expanded", "false");

    // Sem sair do gatilho, o clique seguinte reabre.
    await user.click(gatilho);
    expect(gatilho).toHaveAttribute("aria-expanded", "true");
  });

  it("sair com o mouse fecha", async () => {
    const user = userEvent.setup();
    const { container } = render(<NavDropdown />);
    const area = container.firstElementChild!;

    await user.hover(area);
    expect(screen.getByText("4 módulos disponíveis")).toBeInTheDocument();

    await user.unhover(area);
    expect(screen.queryByText("4 módulos disponíveis")).not.toBeInTheDocument();
  });

  it("clicar num módulo fecha o painel", async () => {
    const user = userEvent.setup();
    render(<NavDropdown />);
    await abrir(user);

    // `fireEvent` em vez de `user.click`: o clique real do usuário aqui
    // envolve sair do gatilho, e o que se testa é o `onClick` do link.
    fireEvent.click(screen.getByRole("link", { name: /Membros/ }));

    expect(screen.queryByText("4 módulos disponíveis")).not.toBeInTheDocument();
  });

  it("'Ver todos' também fecha o painel", async () => {
    const user = userEvent.setup();
    render(<NavDropdown />);
    await abrir(user);

    fireEvent.click(screen.getByRole("link", { name: "Ver todos →" }));

    expect(screen.queryByText("4 módulos disponíveis")).not.toBeInTheDocument();
  });

  it("clique fora fecha; clique dentro mantém aberto", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <NavDropdown />
        <button type="button">fora</button>
      </div>
    );
    await abrir(user);

    fireEvent.mouseDown(screen.getByText("4 módulos disponíveis"));
    expect(screen.getByText("4 módulos disponíveis")).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole("button", { name: "fora" }));
    expect(screen.queryByText("4 módulos disponíveis")).not.toBeInTheDocument();
  });

  it("Escape fecha; outra tecla não", async () => {
    const user = userEvent.setup();
    render(<NavDropdown />);
    await abrir(user);

    await user.keyboard("a");
    expect(screen.getByText("4 módulos disponíveis")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByText("4 módulos disponíveis")).not.toBeInTheDocument();
  });

  it("solta os ouvintes de documento ao desmontar", () => {
    const remover = vi.spyOn(document, "removeEventListener");
    const { unmount } = render(<NavDropdown />);

    unmount();

    expect(remover).toHaveBeenCalledWith("mousedown", expect.any(Function));
    expect(remover).toHaveBeenCalledWith("keydown", expect.any(Function));
    remover.mockRestore();
  });
});

describe("Footer", () => {
  it("lista as três colunas de links com os destinos certos", () => {
    render(<Footer />);

    expect(screen.getByText("Produto")).toBeInTheDocument();
    expect(screen.getByText("Empresa")).toBeInTheDocument();
    expect(screen.getByText("Legal e segurança")).toBeInTheDocument();

    expect(
      screen.getByRole("link", { name: "Funcionalidades" })
    ).toHaveAttribute("href", "/funcionalidades");
    expect(screen.getByRole("link", { name: "Comparativo" })).toHaveAttribute(
      "href",
      "/funcionalidades#comparativo"
    );
    expect(screen.getByRole("link", { name: "WhatsApp" })).toHaveAttribute(
      "href",
      "https://wa.me/5554999529683"
    );
    expect(screen.getByRole("link", { name: "LGPD" })).toHaveAttribute(
      "href",
      "/lgpd"
    );
  });

  it("traz a marca, a descrição e os três atalhos de rede", () => {
    render(<Footer />);

    expect(screen.getByRole("link", { name: /Orbien/ })).toHaveAttribute(
      "href",
      "/"
    );
    expect(
      screen.getByText(/Plataforma e app white-label para igrejas/)
    ).toBeInTheDocument();
    for (const rede of ["Instagram", "YouTube", "LinkedIn"]) {
      expect(screen.getByRole("link", { name: rede })).toHaveAttribute(
        "href",
        "#"
      );
    }
  });

  it("o rodapé assina com o ano corrente", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-02-01T12:00:00.000Z"));

    render(<Footer />);

    expect(
      screen.getByText(/© 2027 Church Platform Ltda · CNPJ a definir/)
    ).toBeInTheDocument();
    expect(screen.getByText("orbien.app")).toBeInTheDocument();
  });
});
