import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import ConfiguracoesPage from "./page";
import api from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), patch: vi.fn(), post: vi.fn() },
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));

const getMock = vi.mocked(api.get);
const patchMock = vi.mocked(api.patch);
const postMock = vi.mocked(api.post);

const revokeObjectURL = vi.fn();

beforeAll(() => {
  // jsdom não implementa nenhum dos dois.
  URL.createObjectURL = vi.fn(() => "blob:logo");
  URL.revokeObjectURL = revokeObjectURL;
});

function settings(overrides: Record<string, unknown> = {}) {
  return {
    tenant: {
      name: "Igreja Matriz",
      email: "contato@matriz.com",
      phone: "11987654321",
    },
    branding: {
      app_name: "App da Matriz",
      primary_color: "#1C3D5A",
      logo_url: "https://cdn/logo.png",
      splash_url: null,
    },
    congregation: {
      name: "Congregação Centro",
      address: "Rua A, 100",
      timezone: "America/Bahia",
      email: "centro@matriz.com",
      phone: "1133334444",
    },
    ...overrides,
  };
}

function comPapeis(roles: string[]) {
  vi.mocked(useAuth).mockReturnValue({
    user: {
      id: "u-1",
      name: "ana",
      email: "ana@igreja.com",
      roles,
      tenant_id: "t-1",
      congregation_id: "c-1",
      support_session: false,
      support_tenant_name: null,
    },
    isLoading: false,
    isAuthenticated: true,
    login: vi.fn(),
    logout: vi.fn(),
  });
}

/** Os rótulos repetem entre seções; a busca é por seção. */
function secao(titulo: string): HTMLElement {
  return screen.getByRole("heading", { name: titulo }).closest("section")!;
}

function campo(secaoTitulo: string, rotulo: string): HTMLElement {
  const alvo = secao(secaoTitulo);
  const label = Array.from(alvo.querySelectorAll("label")).find(
    (l) => l.textContent === rotulo
  )!;
  // "Cor principal" tem dois controles — o seletor de cor e o campo de
  // texto; o texto é o que se digita.
  return label.parentElement!.querySelector(
    'input:not([type="color"]), select'
  ) as HTMLElement;
}

beforeEach(() => {
  getMock.mockReset().mockResolvedValue({ data: settings() } as never);
  patchMock.mockReset().mockResolvedValue({ data: settings() } as never);
  postMock
    .mockReset()
    .mockResolvedValue({ data: { logo_url: "https://cdn/novo.png" } } as never);
  revokeObjectURL.mockClear();
  comPapeis(["tenant_admin"]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ConfiguracoesPage — carga", () => {
  it("preenche os campos das três seções com o que a API devolveu", async () => {
    render(<ConfiguracoesPage />);

    await waitFor(() =>
      expect(campo("Congregação", "Nome *")).toHaveValue("Congregação Centro")
    );
    expect(getMock).toHaveBeenCalledWith("/settings");
    expect(campo("Congregação", "Endereço")).toHaveValue("Rua A, 100");
    expect(campo("Congregação", "Fuso horário")).toHaveValue("America/Bahia");
    expect(campo("Congregação", "E-mail")).toHaveValue("centro@matriz.com");
    // O telefone chega cru da API e é exibido com máscara.
    expect(campo("Congregação", "Telefone")).toHaveValue("(11) 33334-444");

    expect(campo("Identidade visual", "Nome do app")).toHaveValue(
      "App da Matriz"
    );
    expect(campo("Organização", "Nome")).toHaveValue("Igreja Matriz");
    expect(campo("Organização", "Telefone")).toHaveValue("(11) 98765-4321");
    expect(screen.getByAltText("Logotipo")).toHaveAttribute(
      "src",
      "https://cdn/logo.png"
    );
  });

  it("campos nulos viram vazio e o fuso cai no padrão", async () => {
    getMock.mockResolvedValue({
      data: settings({
        tenant: { name: "Só nome", email: null, phone: null },
        branding: {
          app_name: null,
          primary_color: null,
          logo_url: null,
          splash_url: null,
        },
        congregation: {
          name: "Centro",
          address: null,
          timezone: "",
          email: null,
          phone: null,
        },
      }),
    } as never);

    render(<ConfiguracoesPage />);

    await waitFor(() =>
      expect(campo("Congregação", "Fuso horário")).toHaveValue(
        "America/Sao_Paulo"
      )
    );
    expect(campo("Congregação", "Endereço")).toHaveValue("");
    expect(campo("Organização", "E-mail")).toHaveValue("");
    // Sem logo nem preview, entra o ícone.
    expect(screen.queryByAltText("Logotipo")).not.toBeInTheDocument();
  });

  it("fuso desconhecido é acrescentado às opções para não sumir da tela", async () => {
    getMock.mockResolvedValue({
      data: settings({
        congregation: {
          name: "Centro",
          address: null,
          timezone: "Europe/Lisbon",
          email: null,
          phone: null,
        },
      }),
    } as never);

    render(<ConfiguracoesPage />);

    await waitFor(() =>
      expect(campo("Congregação", "Fuso horário")).toHaveValue("Europe/Lisbon")
    );
    expect(
      screen.getByRole("option", { name: "Europe/Lisbon" })
    ).toBeInTheDocument();
  });

  it("erro na carga substitui o formulário pela mensagem", async () => {
    getMock.mockRejectedValue(new Error("500"));

    render(<ConfiguracoesPage />);

    expect(
      await screen.findByText("Erro ao carregar configurações.")
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Salvar alterações/ })
    ).not.toBeInTheDocument();
  });
});

describe("ConfiguracoesPage — salvar", () => {
  async function esperarCarga() {
    await waitFor(() =>
      expect(campo("Congregação", "Nome *")).toHaveValue("Congregação Centro")
    );
  }

  it("manda congregação e organização, com telefone sem máscara", async () => {
    const user = userEvent.setup();
    render(<ConfiguracoesPage />);
    await esperarCarga();

    await user.click(screen.getByRole("button", { name: /Salvar alterações/ }));

    await waitFor(() =>
      expect(patchMock).toHaveBeenCalledWith("/settings", {
        congregation: {
          name: "Congregação Centro",
          address: "Rua A, 100",
          timezone: "America/Bahia",
          email: "centro@matriz.com",
          phone: "1133334444",
          app_name: "App da Matriz",
          primary_color: "#1C3D5A",
        },
        tenant: {
          name: "Igreja Matriz",
          email: "contato@matriz.com",
          phone: "11987654321",
        },
      })
    );
    expect(
      await screen.findByText("Configurações salvas com sucesso.")
    ).toBeInTheDocument();
  });

  it("campos opcionais vazios saem como undefined", async () => {
    const user = userEvent.setup();
    getMock.mockResolvedValue({
      data: settings({
        tenant: { name: "Igreja", email: null, phone: null },
        branding: {
          app_name: null,
          primary_color: null,
          logo_url: null,
          splash_url: null,
        },
        congregation: {
          name: "Centro",
          address: null,
          timezone: "America/Sao_Paulo",
          email: null,
          phone: null,
        },
      }),
    } as never);

    render(<ConfiguracoesPage />);
    await waitFor(() =>
      expect(campo("Congregação", "Nome *")).toHaveValue("Centro")
    );

    await user.click(screen.getByRole("button", { name: /Salvar alterações/ }));

    await waitFor(() =>
      expect(patchMock).toHaveBeenCalledWith("/settings", {
        congregation: {
          name: "Centro",
          address: undefined,
          timezone: "America/Sao_Paulo",
          email: undefined,
          phone: undefined,
          app_name: undefined,
          primary_color: undefined,
        },
        tenant: { name: "Igreja", email: undefined, phone: undefined },
      })
    );
  });

  it("edita todos os campos e manda o que foi digitado", async () => {
    const user = userEvent.setup();
    render(<ConfiguracoesPage />);
    await esperarCarga();

    await user.clear(campo("Congregação", "Nome *"));
    await user.type(campo("Congregação", "Nome *"), "Congregação Sul");
    await user.clear(campo("Congregação", "Endereço"));
    await user.type(campo("Congregação", "Endereço"), "Rua B, 200");
    await user.selectOptions(
      campo("Congregação", "Fuso horário"),
      "America/Manaus"
    );
    await user.clear(campo("Congregação", "E-mail"));
    await user.type(campo("Congregação", "E-mail"), "sul@matriz.com");
    await user.clear(campo("Congregação", "Telefone"));
    await user.type(campo("Congregação", "Telefone"), "11912345678");
    await user.clear(campo("Identidade visual", "Nome do app"));
    await user.type(campo("Identidade visual", "Nome do app"), "App do Sul");
    await user.clear(campo("Organização", "Nome"));
    await user.type(campo("Organização", "Nome"), "Igreja Nova");
    await user.clear(campo("Organização", "Telefone"));
    await user.type(campo("Organização", "Telefone"), "1130001111");

    // O seletor de cor escreve no mesmo estado do campo de texto.
    fireEvent.change(
      secao("Identidade visual").querySelector('input[type="color"]')!,
      { target: { value: "#abcdef" } }
    );

    await user.click(screen.getByRole("button", { name: /Salvar alterações/ }));

    await waitFor(() =>
      expect(patchMock).toHaveBeenCalledWith("/settings", {
        congregation: {
          name: "Congregação Sul",
          address: "Rua B, 200",
          timezone: "America/Manaus",
          email: "sul@matriz.com",
          phone: "11912345678",
          app_name: "App do Sul",
          primary_color: "#abcdef",
        },
        tenant: {
          name: "Igreja Nova",
          email: "contato@matriz.com",
          phone: "1130001111",
        },
      })
    );
  });

  it("nomes nulos na resposta não quebram o formulário", async () => {
    getMock.mockResolvedValue({
      data: {
        tenant: { name: null, email: null, phone: null },
        branding: {
          app_name: null,
          primary_color: null,
          logo_url: null,
          splash_url: null,
        },
        congregation: {
          name: null,
          address: null,
          timezone: "America/Sao_Paulo",
          email: null,
          phone: null,
        },
      },
    } as never);

    render(<ConfiguracoesPage />);

    await waitFor(() =>
      expect(campo("Organização", "Nome")).toHaveValue("")
    );
    expect(campo("Congregação", "Nome *")).toHaveValue("");
  });

  it("montagem dupla não duplica a busca", async () => {
    render(
      <StrictMode>
        <ConfiguracoesPage />
      </StrictMode>
    );

    await esperarCarga();
    expect(getMock).toHaveBeenCalledTimes(1);
  });

  it("nome da congregação vazio bloqueia o envio", async () => {
    const user = userEvent.setup();
    render(<ConfiguracoesPage />);
    await esperarCarga();

    await user.clear(campo("Congregação", "Nome *"));
    await user.click(screen.getByRole("button", { name: /Salvar alterações/ }));

    expect(
      await screen.findByText("Nome da congregação é obrigatório.")
    ).toBeInTheDocument();
    expect(patchMock).not.toHaveBeenCalled();
  });

  it("e-mail da congregação inválido bloqueia o envio", async () => {
    const user = userEvent.setup();
    render(<ConfiguracoesPage />);
    await esperarCarga();

    await user.clear(campo("Congregação", "E-mail"));
    await user.type(campo("Congregação", "E-mail"), "sem-arroba");
    await user.click(screen.getByRole("button", { name: /Salvar alterações/ }));

    expect(
      await screen.findByText("E-mail da congregação inválido.")
    ).toBeInTheDocument();
    expect(patchMock).not.toHaveBeenCalled();
  });

  it("e-mail da organização inválido bloqueia o envio", async () => {
    const user = userEvent.setup();
    render(<ConfiguracoesPage />);
    await esperarCarga();

    await user.clear(campo("Organização", "E-mail"));
    await user.type(campo("Organização", "E-mail"), "errado@");
    await user.click(screen.getByRole("button", { name: /Salvar alterações/ }));

    expect(
      await screen.findByText("E-mail da organização inválido.")
    ).toBeInTheDocument();
  });

  it("cor fora do hexadecimal bloqueia o envio", async () => {
    const user = userEvent.setup();
    render(<ConfiguracoesPage />);
    await esperarCarga();

    const cor = campo("Identidade visual", "Cor principal");
    await user.clear(cor);
    await user.type(cor, "azul");
    await user.click(screen.getByRole("button", { name: /Salvar alterações/ }));

    expect(
      await screen.findByText(
        "Cor principal deve ser um código hexadecimal válido (ex: #1C3D5A)."
      )
    ).toBeInTheDocument();
  });

  it("falha no PATCH mostra o erro e libera o botão", async () => {
    const user = userEvent.setup();
    patchMock.mockRejectedValue(new Error("500"));

    render(<ConfiguracoesPage />);
    await esperarCarga();

    await user.click(screen.getByRole("button", { name: /Salvar alterações/ }));

    expect(
      await screen.findByText(
        "Erro ao salvar configurações. Tente novamente."
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Salvar alterações/ })
    ).toBeEnabled();
  });

  it("enquanto salva, os campos e o botão ficam travados", async () => {
    const user = userEvent.setup();
    let liberar!: (v: unknown) => void;
    patchMock.mockImplementation(
      () => new Promise((resolve) => (liberar = resolve)) as never
    );

    render(<ConfiguracoesPage />);
    await esperarCarga();

    await user.click(screen.getByRole("button", { name: /Salvar alterações/ }));

    await waitFor(() =>
      expect(campo("Congregação", "Nome *")).toBeDisabled()
    );
    expect(
      screen.getByRole("button", { name: /Salvar alterações/ })
    ).toBeDisabled();

    liberar({ data: settings() });
    await waitFor(() =>
      expect(campo("Congregação", "Nome *")).toBeEnabled()
    );
  });

  it("o aviso de sucesso sai depois de três segundos", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({
      advanceTimers: vi.advanceTimersByTime.bind(vi),
    });

    render(<ConfiguracoesPage />);
    await vi.waitFor(() =>
      expect(campo("Congregação", "Nome *")).toHaveValue("Congregação Centro")
    );

    await user.click(screen.getByRole("button", { name: /Salvar alterações/ }));
    await vi.waitFor(() =>
      expect(
        screen.getByText("Configurações salvas com sucesso.")
      ).toBeInTheDocument()
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(
      screen.queryByText("Configurações salvas com sucesso.")
    ).not.toBeInTheDocument();
  });
});

describe("ConfiguracoesPage — logotipo", () => {
  async function esperarCarga() {
    await waitFor(() =>
      expect(campo("Congregação", "Nome *")).toHaveValue("Congregação Centro")
    );
  }

  function inputDeArquivo(): HTMLInputElement {
    return secao("Identidade visual").querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
  }

  it("arquivo válido entra como preview e sobe junto com o salvar", async () => {
    const user = userEvent.setup();
    render(<ConfiguracoesPage />);
    await esperarCarga();

    const arquivo = new File(["x"], "logo.png", { type: "image/png" });
    await user.upload(inputDeArquivo(), arquivo);

    expect(screen.getByAltText("Logotipo")).toHaveAttribute("src", "blob:logo");

    await user.click(screen.getByRole("button", { name: /Salvar alterações/ }));

    await waitFor(() => expect(postMock).toHaveBeenCalled());
    const [url, corpo] = postMock.mock.calls[0];
    expect(url).toBe("/settings/logo");
    expect(corpo).toBeInstanceOf(FormData);
    expect((corpo as FormData).get("file")).toBe(arquivo);

    // Depois do upload, a URL definitiva substitui o preview, que é revogado.
    await waitFor(() =>
      expect(screen.getByAltText("Logotipo")).toHaveAttribute(
        "src",
        "https://cdn/novo.png"
      )
    );
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:logo");
    expect(inputDeArquivo().value).toBe("");
  });

  it("diálogo cancelado não muda nada", async () => {
    render(<ConfiguracoesPage />);
    await esperarCarga();

    fireEvent.change(inputDeArquivo(), { target: { files: [] } });

    expect(screen.getByAltText("Logotipo")).toHaveAttribute(
      "src",
      "https://cdn/logo.png"
    );
  });

  it("formato não suportado é recusado antes de virar preview", async () => {
    render(<ConfiguracoesPage />);
    await esperarCarga();

    // `user.upload` respeita o `accept` do input e recusaria o arquivo antes
    // de chegar ao handler; aqui o que se testa é a guarda do handler.
    fireEvent.change(inputDeArquivo(), {
      target: {
        files: [new File(["x"], "planilha.pdf", { type: "application/pdf" })],
      },
    });

    expect(
      await screen.findByText("Formato não suportado. Use JPG, PNG, WEBP ou SVG.")
    ).toBeInTheDocument();
    expect(screen.getByAltText("Logotipo")).toHaveAttribute(
      "src",
      "https://cdn/logo.png"
    );
  });

  it("arquivo acima de 5MB é recusado", async () => {
    const user = userEvent.setup();
    render(<ConfiguracoesPage />);
    await esperarCarga();

    const grande = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "logo.png", {
      type: "image/png",
    });
    await user.upload(inputDeArquivo(), grande);

    expect(
      await screen.findByText("Arquivo muito grande. Máximo: 5MB.")
    ).toBeInTheDocument();
  });

  it("trocar de arquivo revoga o preview anterior", async () => {
    const user = userEvent.setup();
    render(<ConfiguracoesPage />);
    await esperarCarga();

    await user.upload(
      inputDeArquivo(),
      new File(["a"], "um.png", { type: "image/png" })
    );
    await user.upload(
      inputDeArquivo(),
      new File(["b"], "dois.png", { type: "image/png" })
    );

    expect(revokeObjectURL).toHaveBeenCalledWith("blob:logo");
  });

  it("o preview é revogado ao desmontar a tela", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<ConfiguracoesPage />);
    await esperarCarga();

    await user.upload(
      inputDeArquivo(),
      new File(["a"], "um.png", { type: "image/png" })
    );
    revokeObjectURL.mockClear();

    unmount();

    expect(revokeObjectURL).toHaveBeenCalledWith("blob:logo");
  });

  it("o botão abre o seletor de arquivo", async () => {
    const user = userEvent.setup();
    render(<ConfiguracoesPage />);
    await esperarCarga();

    const clique = vi.spyOn(inputDeArquivo(), "click");
    await user.click(screen.getByRole("button", { name: "Alterar logotipo" }));

    expect(clique).toHaveBeenCalled();
  });

  it("o seletor de cor cai no padrão quando o campo não é hexadecimal", async () => {
    const user = userEvent.setup();
    render(<ConfiguracoesPage />);
    await esperarCarga();

    const seletor = secao("Identidade visual").querySelector(
      'input[type="color"]'
    ) as HTMLInputElement;
    expect(seletor.value).toBe("#1c3d5a");

    const texto = campo("Identidade visual", "Cor principal");
    await user.clear(texto);
    await user.type(texto, "#00ff00");
    expect(seletor.value).toBe("#00ff00");

    // Escolher no seletor escreve no campo de texto.
    await user.clear(texto);
    await user.type(texto, "nada");
    expect(seletor.value).toBe("#1c3d5a");
  });
});

describe("ConfiguracoesPage — permissões", () => {
  it("admin de congregação edita a congregação, não a organização", async () => {
    comPapeis(["admin_congregation"]);
    render(<ConfiguracoesPage />);

    await waitFor(() =>
      expect(campo("Congregação", "Nome *")).toBeEnabled()
    );
    expect(campo("Organização", "Nome")).toBeDisabled();
    expect(
      screen.getByText(
        "Apenas administradores da organização podem editar esses dados."
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Salvar alterações/ })
    ).toBeInTheDocument();
  });

  it("admin de congregação manda só o bloco da congregação", async () => {
    const user = userEvent.setup();
    comPapeis(["admin_congregation"]);
    render(<ConfiguracoesPage />);
    await waitFor(() => expect(campo("Congregação", "Nome *")).toBeEnabled());

    await user.click(screen.getByRole("button", { name: /Salvar alterações/ }));

    await waitFor(() => expect(patchMock).toHaveBeenCalled());
    expect(patchMock.mock.calls[0][1]).not.toHaveProperty("tenant");
  });

  it("tenant_admin vê o texto de dados compartilhados", async () => {
    render(<ConfiguracoesPage />);

    expect(
      await screen.findByText(
        "Dados compartilhados entre todas as congregações da organização."
      )
    ).toBeInTheDocument();
  });

  it("quem não edita nada não vê o botão de salvar nem o de logotipo", async () => {
    comPapeis(["member"]);
    render(<ConfiguracoesPage />);

    await waitFor(() =>
      expect(campo("Congregação", "Nome *")).toBeDisabled()
    );
    expect(
      screen.queryByRole("button", { name: /Salvar alterações/ })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Alterar logotipo" })
    ).not.toBeInTheDocument();
  });

  it("sessão sem usuário resolvido é somente leitura", async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isLoading: false,
      isAuthenticated: false,
      login: vi.fn(),
      logout: vi.fn(),
    });

    render(<ConfiguracoesPage />);

    await waitFor(() =>
      expect(campo("Congregação", "Nome *")).toBeDisabled()
    );
    expect(
      screen.queryByRole("button", { name: /Salvar alterações/ })
    ).not.toBeInTheDocument();
  });
});
