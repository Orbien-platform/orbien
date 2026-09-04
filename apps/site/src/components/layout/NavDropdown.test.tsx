import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { NavDropdown } from "@/components/layout/NavDropdown";

function trigger() {
  return screen.getByRole("button", { name: /funcionalidades/i });
}

function panel() {
  return screen.queryByText("4 módulos disponíveis");
}

/**
 * O painel abre por hover (`onMouseEnter` no wrapper) e por clique no
 * gatilho. Com mouse real os dois se sobrepõem — o hover já abriu quando o
 * clique chega, e o toggle fecharia de volta. `fireEvent.click` isola o
 * caminho sem ponteiro (teclado e toque), que é o que o `onClick` serve.
 */
function abrePorClique() {
  fireEvent.click(trigger());
}

describe("NavDropdown", () => {
  it("começa fechado", () => {
    render(<NavDropdown />);
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
    expect(panel()).not.toBeInTheDocument();
  });

  it("abre e fecha no clique do gatilho", () => {
    render(<NavDropdown />);

    abrePorClique();
    expect(trigger()).toHaveAttribute("aria-expanded", "true");
    expect(panel()).toBeInTheDocument();

    fireEvent.click(trigger());
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
    expect(panel()).not.toBeInTheDocument();
  });

  it("abre no hover e fecha ao sair", async () => {
    const user = userEvent.setup();
    const { container } = render(<NavDropdown />);
    const wrapper = container.firstElementChild as HTMLElement;

    await user.hover(wrapper);
    expect(panel()).toBeInTheDocument();

    await user.unhover(wrapper);
    expect(panel()).not.toBeInTheDocument();
  });

  it.each([
    ["Membros", "/funcionalidades/membros"],
    ["Financeiro", "/funcionalidades/financeiro"],
    ["Pequenos Grupos", "/funcionalidades/pequenos-grupos"],
    ["Conteúdos", "/funcionalidades/conteudos"],
  ])("lista o módulo %s apontando para %s", (title, href) => {
    render(<NavDropdown />);
    abrePorClique();
    expect(screen.getByRole("link", { name: new RegExp(title) })).toHaveAttribute("href", href);
  });

  it("descreve cada módulo no painel", () => {
    render(<NavDropdown />);
    abrePorClique();
    expect(screen.getByText("Cadastro, ciclo de vida e presença")).toBeInTheDocument();
    expect(screen.getByText("PIX, recibos e relatórios")).toBeInTheDocument();
    expect(screen.getByText("Semáforo, materiais e líder mobile")).toBeInTheDocument();
    expect(screen.getByText("Avisos, devocionais e oração")).toBeInTheDocument();
  });

  it("fecha ao escolher um módulo", () => {
    render(<NavDropdown />);
    abrePorClique();
    fireEvent.click(screen.getByRole("link", { name: /Membros/ }));
    expect(panel()).not.toBeInTheDocument();
  });

  it('fecha ao clicar em "Ver todos"', () => {
    render(<NavDropdown />);
    abrePorClique();
    const verTodos = screen.getByRole("link", { name: "Ver todos →" });
    expect(verTodos).toHaveAttribute("href", "/funcionalidades");
    fireEvent.click(verTodos);
    expect(panel()).not.toBeInTheDocument();
  });

  it("fecha ao clicar fora", () => {
    render(<NavDropdown />);
    abrePorClique();
    fireEvent.mouseDown(document.body);
    expect(panel()).not.toBeInTheDocument();
  });

  it("mantém aberto quando o mousedown é dentro do painel", () => {
    render(<NavDropdown />);
    abrePorClique();
    fireEvent.mouseDown(panel()!);
    expect(panel()).toBeInTheDocument();
  });

  it("fecha no Escape", () => {
    render(<NavDropdown />);
    abrePorClique();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(panel()).not.toBeInTheDocument();
  });

  it("ignora outras teclas", () => {
    render(<NavDropdown />);
    abrePorClique();
    fireEvent.keyDown(document, { key: "Enter" });
    expect(panel()).toBeInTheDocument();
  });

  it("remove os listeners de documento ao desmontar", () => {
    const { unmount } = render(<NavDropdown />);
    abrePorClique();
    unmount();
    // Sem o cleanup, este keydown ainda chamaria setState em componente
    // desmontado — o teste falharia no aviso do React.
    fireEvent.keyDown(document, { key: "Escape" });
    expect(panel()).not.toBeInTheDocument();
  });
});
