import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import api from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import ConfiguracoesPage from "./page";

vi.mock("@/lib/api", () => ({
  // Espelha o `isForbidden` real: 403 e só 403.
  isForbidden: (error: unknown) =>
    (error as { response?: { status?: number } })?.response?.status === 403,
  default: { get: vi.fn(), patch: vi.fn(), post: vi.fn() },
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));

const mockedApi = vi.mocked(api, true);
const mockedUseAuth = vi.mocked(useAuth);

function setup(roles: string[] = ["tenant_admin"]) {
  mockedUseAuth.mockReturnValue({
    user: {
      id: "u1",
      name: "Ana",
      email: "ana@a.com",
      roles,
      tenant_id: "t1",
      congregation_id: "c1",
      support_session: false,
      support_tenant_name: null,
    support_expires_at: null,
    },
    isLoading: false,
    isAuthenticated: true,
    login: vi.fn(),
    logout: vi.fn(),
  });
}

function settingsPayload(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    tenant: { name: "Doca Church", email: "org@doca.com", phone: "11987654321" },
    branding: { app_name: "Doca App", primary_color: "#1C3D5A", logo_url: null, splash_url: null },
    congregation: {
      name: "Doca Sede",
      address: "Rua X, 100",
      timezone: "America/Sao_Paulo",
      email: "cong@doca.com",
      phone: "11912345678",
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom não implementa createObjectURL/revokeObjectURL.
  global.URL.createObjectURL = vi.fn(() => "blob:preview");
  global.URL.revokeObjectURL = vi.fn();
});

describe("ConfiguracoesPage", () => {
  it("carrega e preenche o formulário com os dados atuais", async () => {
    setup();
    mockedApi.get.mockResolvedValue({ data: settingsPayload() });
    render(<ConfiguracoesPage />);
    expect(await screen.findByDisplayValue("Doca Sede")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Doca App")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Doca Church")).toBeInTheDocument();
    expect(screen.getByDisplayValue("(11) 91234-5678")).toBeInTheDocument();
  });

  it("mostra erro de carregamento quando a API falha", async () => {
    setup();
    mockedApi.get.mockRejectedValue(new Error("boom"));
    render(<ConfiguracoesPage />);
    expect(await screen.findByText("Erro ao carregar configurações.")).toBeInTheDocument();
  });

  it("valida nome de congregação obrigatório", async () => {
    setup();
    mockedApi.get.mockResolvedValue({ data: settingsPayload({ congregation: { name: "", address: "", timezone: "America/Sao_Paulo", email: "", phone: "" } }) });
    const user = userEvent.setup();
    render(<ConfiguracoesPage />);
    await screen.findByText("Salvar alterações");
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    expect(await screen.findByText("Nome da congregação é obrigatório.")).toBeInTheDocument();
    expect(mockedApi.patch).not.toHaveBeenCalled();
  });

  it("valida e-mail de congregação e de organização inválidos, e cor inválida", async () => {
    setup();
    mockedApi.get.mockResolvedValue({ data: settingsPayload() });
    const user = userEvent.setup();
    render(<ConfiguracoesPage />);
    const congEmail = await screen.findByDisplayValue("cong@doca.com");
    await user.clear(congEmail);
    await user.type(congEmail, "invalido");
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    expect(await screen.findByText("E-mail da congregação inválido.")).toBeInTheDocument();

    await user.clear(congEmail);
    await user.type(congEmail, "cong@doca.com");
    const orgEmail = screen.getByDisplayValue("org@doca.com");
    await user.clear(orgEmail);
    await user.type(orgEmail, "invalido");
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    expect(await screen.findByText("E-mail da organização inválido.")).toBeInTheDocument();

    await user.clear(orgEmail);
    await user.type(orgEmail, "org@doca.com");
    const colorInput = screen.getByPlaceholderText("#1C3D5A");
    await user.clear(colorInput);
    await user.type(colorInput, "not-a-color");
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    expect(
      await screen.findByText("Cor principal deve ser um código hexadecimal válido (ex: #1C3D5A).")
    ).toBeInTheDocument();
  });

  it("salva com sucesso, reaplica os dados retornados e mostra o toast", async () => {
    setup();
    mockedApi.get.mockResolvedValue({ data: settingsPayload() });
    mockedApi.patch.mockResolvedValue({
      data: settingsPayload({ congregation: { name: "Nome Novo", address: "", timezone: "America/Sao_Paulo", email: "", phone: "" } }),
    });
    const user = userEvent.setup();
    render(<ConfiguracoesPage />);
    await screen.findByDisplayValue("Doca Sede");
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    expect(await screen.findByText("Configurações salvas com sucesso.")).toBeInTheDocument();
    expect(await screen.findByDisplayValue("Nome Novo")).toBeInTheDocument();
    expect(mockedApi.patch).toHaveBeenCalledWith(
      "/settings",
      expect.objectContaining({ congregation: expect.any(Object), tenant: expect.any(Object) })
    );
  });

  it("mostra erro ao salvar quando a API falha", async () => {
    setup();
    mockedApi.get.mockResolvedValue({ data: settingsPayload() });
    mockedApi.patch.mockRejectedValue(new Error("boom"));
    const user = userEvent.setup();
    render(<ConfiguracoesPage />);
    await screen.findByDisplayValue("Doca Sede");
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    expect(
      await screen.findByText("Erro ao salvar configurações. Tente novamente.")
    ).toBeInTheDocument();
  });

  it("faz upload do logotipo após salvar as configurações, quando um arquivo foi escolhido", async () => {
    setup();
    mockedApi.get.mockResolvedValue({ data: settingsPayload() });
    mockedApi.patch.mockResolvedValue({ data: settingsPayload() });
    mockedApi.post.mockResolvedValue({ data: { logo_url: "https://cdn/logo.png" } });
    const user = userEvent.setup();
    render(<ConfiguracoesPage />);
    await screen.findByDisplayValue("Doca Sede");

    const file = new File(["conteudo"], "logo.png", { type: "image/png" });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, file);

    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await waitFor(() => expect(mockedApi.post).toHaveBeenCalledWith("/settings/logo", expect.any(FormData)));
    expect(await screen.findByAltText("Logotipo")).toHaveAttribute("src", "https://cdn/logo.png");
  });

  it("rejeita arquivo de logotipo com formato ou tamanho inválidos", async () => {
    setup();
    mockedApi.get.mockResolvedValue({ data: settingsPayload() });
    render(<ConfiguracoesPage />);
    await screen.findByDisplayValue("Doca Sede");
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;

    // `userEvent.upload` valida o `accept` do input e nem dispara o evento
    // para um tipo fora dele — exatamente o caso que este teste quer cobrir,
    // então o disparo é direto via `fireEvent`.
    const badType = new File(["x"], "arquivo.txt", { type: "text/plain" });
    fireEvent.change(fileInput, { target: { files: [badType] } });
    expect(await screen.findByText("Formato não suportado. Use JPG, PNG, WEBP ou SVG.")).toBeInTheDocument();

    const big = new File([new Uint8Array(6 * 1024 * 1024)], "big.png", { type: "image/png" });
    fireEvent.change(fileInput, { target: { files: [big] } });
    expect(await screen.findByText("Arquivo muito grande. Máximo: 5MB.")).toBeInTheDocument();
  });

  it("ignora o evento de seleção quando nenhum arquivo foi escolhido", async () => {
    setup();
    mockedApi.get.mockResolvedValue({ data: settingsPayload() });
    render(<ConfiguracoesPage />);
    await screen.findByDisplayValue("Doca Sede");
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [] } });
    expect(screen.queryByAltText("Logotipo")).not.toBeInTheDocument();
  });

  it("troca o logotipo escolhido antes de salvar (revoga a preview anterior)", async () => {
    setup();
    mockedApi.get.mockResolvedValue({ data: settingsPayload() });
    const user = userEvent.setup();
    render(<ConfiguracoesPage />);
    await screen.findByDisplayValue("Doca Sede");
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;

    await user.upload(fileInput, new File(["a"], "um.png", { type: "image/png" }));
    await user.upload(fileInput, new File(["b"], "dois.png", { type: "image/png" }));
    expect(global.URL.revokeObjectURL).toHaveBeenCalled();
  });

  it("aplica máscara de telefone nos campos de congregação e organização", async () => {
    setup();
    mockedApi.get.mockResolvedValue({ data: settingsPayload({ congregation: { name: "X", address: "", timezone: "America/Sao_Paulo", email: "", phone: "" }, tenant: { name: "Y", email: "", phone: "" } }) });
    const user = userEvent.setup();
    render(<ConfiguracoesPage />);
    const phoneInputs = await screen.findAllByPlaceholderText("(11) 99999-9999");
    await user.type(phoneInputs[0], "11987654321");
    expect(phoneInputs[0]).toHaveValue("(11) 98765-4321");
  });

  it("aceita fuso horário fora da lista padrão adicionando-o às opções", async () => {
    setup();
    mockedApi.get.mockResolvedValue({
      data: settingsPayload({
        congregation: { name: "X", address: "", timezone: "Europe/Lisbon", email: "", phone: "" },
      }),
    });
    render(<ConfiguracoesPage />);
    expect(await screen.findByDisplayValue("Europe/Lisbon")).toBeInTheDocument();
  });

  it("desabilita os campos de congregação para quem não é admin_congregation/tenant_admin, mas ainda mostra tenant e não mostra o botão salvar", async () => {
    setup(["volunteer"]);
    mockedApi.get.mockResolvedValue({ data: settingsPayload() });
    render(<ConfiguracoesPage />);
    const congName = await screen.findByDisplayValue("Doca Sede");
    expect(congName).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Salvar alterações" })).not.toBeInTheDocument();
    expect(
      screen.getByText("Apenas administradores da organização podem editar esses dados.")
    ).toBeInTheDocument();
  });

  it("permite admin_congregation editar a congregação mas não a organização", async () => {
    setup(["admin_congregation"]);
    mockedApi.get.mockResolvedValue({ data: settingsPayload() });
    render(<ConfiguracoesPage />);
    const congName = await screen.findByDisplayValue("Doca Sede");
    expect(congName).not.toBeDisabled();
    const tenantName = screen.getByDisplayValue("Doca Church");
    expect(tenantName).toBeDisabled();
    expect(screen.getByRole("button", { name: "Salvar alterações" })).toBeInTheDocument();
    expect(
      screen.getByText("Apenas administradores da organização podem editar esses dados.")
    ).toBeInTheDocument();
  });

  it("mostra a frase de organização compartilhada para tenant_admin", async () => {
    setup(["tenant_admin"]);
    mockedApi.get.mockResolvedValue({ data: settingsPayload() });
    render(<ConfiguracoesPage />);
    await screen.findByDisplayValue("Doca Sede");
    expect(
      screen.getByText("Dados compartilhados entre todas as congregações da organização.")
    ).toBeInTheDocument();
  });

  it("aceita edição em todos os campos e envia undefined para os opcionais deixados em branco", async () => {
    setup(["tenant_admin"]);
    mockedApi.get.mockResolvedValue({ data: settingsPayload() });
    mockedApi.patch.mockResolvedValue({ data: settingsPayload() });
    const user = userEvent.setup();
    render(<ConfiguracoesPage />);
    await screen.findByDisplayValue("Doca Sede");

    const congName = screen.getByDisplayValue("Doca Sede");
    await user.clear(congName);
    await user.type(congName, "Nova Sede");

    await user.selectOptions(screen.getByDisplayValue("Brasília (UTC−3)"), "America/Manaus");

    const appName = screen.getByDisplayValue("Doca App");
    await user.clear(appName);

    const colorText = screen.getByPlaceholderText("#1C3D5A");
    fireEvent.change(colorText, { target: { value: "" } });
    const colorPicker = document.querySelector('input[type="color"]') as HTMLInputElement;
    fireEvent.change(colorPicker, { target: { value: "#123456" } });

    const tenantName = screen.getByDisplayValue("Doca Church");
    await user.clear(tenantName);
    await user.type(tenantName, "Doca Church Org");

    // Limpa os opcionais para exercitar o `.trim() || undefined`.
    for (const value of ["Rua X, 100", "cong@doca.com", "org@doca.com"]) {
      const el = screen.getByDisplayValue(value);
      await user.clear(el);
    }
    for (const placeholder of ["(11) 99999-9999"]) {
      for (const el of screen.getAllByPlaceholderText(placeholder)) {
        await user.clear(el);
      }
    }

    await user.click(screen.getByRole("button", { name: "Alterar logotipo" }));

    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await waitFor(() => expect(mockedApi.patch).toHaveBeenCalled());
    expect(mockedApi.patch).toHaveBeenCalledWith("/settings", {
      congregation: {
        name: "Nova Sede",
        address: undefined,
        timezone: "America/Manaus",
        email: undefined,
        phone: undefined,
        app_name: undefined,
        primary_color: "#123456",
      },
      tenant: {
        name: "Doca Church Org",
        email: undefined,
        phone: undefined,
      },
    });
  });

  it("admin_congregation salva só a congregação (payload sem tenant)", async () => {
    setup(["admin_congregation"]);
    mockedApi.get.mockResolvedValue({ data: settingsPayload() });
    mockedApi.patch.mockResolvedValue({ data: settingsPayload() });
    const user = userEvent.setup();
    render(<ConfiguracoesPage />);
    await screen.findByDisplayValue("Doca Sede");
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await waitFor(() => expect(mockedApi.patch).toHaveBeenCalled());
    const [, payload] = mockedApi.patch.mock.calls[0];
    expect(payload).not.toHaveProperty("tenant");
    expect(payload).toHaveProperty("congregation");
  });

  it("envia primary_color como undefined quando o campo de cor fica vazio", async () => {
    setup();
    mockedApi.get.mockResolvedValue({ data: settingsPayload() });
    mockedApi.patch.mockResolvedValue({ data: settingsPayload() });
    const user = userEvent.setup();
    render(<ConfiguracoesPage />);
    await screen.findByDisplayValue("Doca Sede");
    await user.clear(screen.getByPlaceholderText("#1C3D5A"));
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await waitFor(() => expect(mockedApi.patch).toHaveBeenCalled());
    const [, payload] = mockedApi.patch.mock.calls[0] as [string, { congregation: { primary_color?: string } }];
    expect(payload.congregation.primary_color).toBeUndefined();
  });

  it("mostra o logotipo existente (logo_url) quando nenhum arquivo novo foi escolhido", async () => {
    setup();
    mockedApi.get.mockResolvedValue({
      data: settingsPayload({ branding: { app_name: "X", primary_color: "#111", logo_url: "https://cdn/existing.png", splash_url: null } }),
    });
    render(<ConfiguracoesPage />);
    await screen.findByDisplayValue("Doca Sede");
    expect(await screen.findByAltText("Logotipo")).toHaveAttribute("src", "https://cdn/existing.png");
  });

  it("mostra travessão de logotipo (ícone) quando não há preview nem url", async () => {
    setup();
    mockedApi.get.mockResolvedValue({ data: settingsPayload({ branding: { app_name: "X", primary_color: "#111", logo_url: null, splash_url: null } }) });
    render(<ConfiguracoesPage />);
    await screen.findByDisplayValue("Doca Sede");
    expect(screen.queryByAltText("Logotipo")).not.toBeInTheDocument();
  });

  it("usa os fallbacks vazios quando os campos vêm ausentes na resposta de configurações", async () => {
    setup();
    mockedApi.get.mockResolvedValue({
      data: {
        tenant: { name: null, email: null, phone: null },
        branding: { app_name: null, primary_color: null, logo_url: null, splash_url: null },
        congregation: { name: null, address: null, timezone: "", email: null, phone: null },
      },
    });
    render(<ConfiguracoesPage />);
    // Sem nome, o campo obrigatório fica vazio — usa o fuso default.
    expect(await screen.findByDisplayValue("Brasília (UTC−3)")).toBeInTheDocument();
  });

  it("trata usuário sem roles como sem permissão nenhuma (fallback ?? false)", async () => {
    mockedUseAuth.mockReturnValue({
      user: {
        id: "u1",
        name: "Ana",
        email: "ana@a.com",
        roles: undefined as unknown as string[],
        tenant_id: "t1",
        congregation_id: "c1",
        support_session: false,
        support_tenant_name: null,
    support_expires_at: null,
      },
      isLoading: false,
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
    });
    mockedApi.get.mockResolvedValue({ data: settingsPayload() });
    render(<ConfiguracoesPage />);
    const congName = await screen.findByDisplayValue("Doca Sede");
    expect(congName).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Salvar alterações" })).not.toBeInTheDocument();
  });

  it("guarda contra a dupla invocação de efeito do StrictMode ao carregar configurações", async () => {
    setup();
    mockedApi.get.mockResolvedValue({ data: settingsPayload() });
    render(
      <StrictMode>
        <ConfiguracoesPage />
      </StrictMode>
    );
    await screen.findByDisplayValue("Doca Sede");
    expect(mockedApi.get).toHaveBeenCalledTimes(1);
  });

  it("desaparece o toast depois de um tempo", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    setup();
    mockedApi.get.mockResolvedValue({ data: settingsPayload() });
    mockedApi.patch.mockResolvedValue({ data: settingsPayload() });
    const user = userEvent.setup({ delay: null });
    render(<ConfiguracoesPage />);
    await screen.findByDisplayValue("Doca Sede");
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await screen.findByText("Configurações salvas com sucesso.");
    vi.advanceTimersByTime(3000);
    await waitFor(() => expect(screen.queryByText("Configurações salvas com sucesso.")).not.toBeInTheDocument());
    vi.useRealTimers();
  });
});
