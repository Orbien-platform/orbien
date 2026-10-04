import { act, fireEvent, render, screen } from "@testing-library/react";
import { useParams } from "next/navigation";
import { AxiosError, AxiosHeaders } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import VisitanteAutocadastroPage from "./page";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  default: { post: vi.fn(), get: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useParams: vi.fn(),
}));

const mockedGet = vi.mocked(api.get);
const mockedPost = vi.mocked(api.post);

function httpError(status: number, message?: string) {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError("erro", String(status), config, null, {
    status,
    statusText: "",
    headers: {},
    config,
    data: message ? { message } : {},
  });
}

const QR = { church_name: "Igreja de Teste 1", origin: "service", label: null };

async function open() {
  await act(async () => {
    render(<VisitanteAutocadastroPage />);
  });
}

async function fill(name = "Ana Souza") {
  fireEvent.change(screen.getByLabelText("Nome"), { target: { value: name } });
  fireEvent.click(screen.getByLabelText(/Aceito que a Igreja de Teste 1/));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useParams).mockReturnValue({ tenant_slug: "teste1-church", token: "tok-1" });
  mockedGet.mockResolvedValue({ data: QR });
});

describe("VisitanteAutocadastroPage", () => {
  it("lê o QR ao abrir e mostra de qual igreja ele é", async () => {
    await open();

    expect(mockedGet).toHaveBeenCalledWith("/public/visitor/qr/tok-1");
    expect(
      screen.getByRole("heading", { name: "Que bom ter você na Igreja de Teste 1" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Cadastro de visitante do culto")).toBeInTheDocument();
  });

  it("o rótulo do QR, quando existe, substitui a origem", async () => {
    mockedGet.mockResolvedValue({ data: { ...QR, label: "Culto da manhã" } });
    await open();
    expect(screen.getByText("Culto da manhã")).toBeInTheDocument();
  });

  it("enquanto lê o QR, mostra o carregando", async () => {
    mockedGet.mockReturnValue(new Promise(() => undefined));
    await open();
    expect(screen.getByRole("status", { name: "Carregando" })).toBeInTheDocument();
  });

  it("QR desativado ou inexistente não mostra o formulário", async () => {
    mockedGet.mockRejectedValue(httpError(404));
    await open();

    expect(screen.getByRole("heading", { name: "Este QR não está mais ativo" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Nome")).not.toBeInTheDocument();
  });

  it("falha ao ler o QR oferece tentar de novo", async () => {
    mockedGet.mockRejectedValueOnce(new Error("rede")).mockResolvedValueOnce({ data: QR });
    await open();

    expect(screen.getByRole("heading", { name: "Não foi possível abrir o cadastro" })).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Tentar de novo/ }));
    });
    expect(mockedGet).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText("Nome")).toBeInTheDocument();
  });

  it("enviar o formulário vazio (Enter) não chama a API", async () => {
    await open();
    fireEvent.submit(screen.getByRole("button", { name: "Enviar cadastro" }).closest("form")!);
    expect(mockedPost).not.toHaveBeenCalled();
  });

  it("não envia sem nome de pelo menos 2 letras ou sem o aceite", async () => {
    await open();
    const submit = screen.getByRole("button", { name: "Enviar cadastro" });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "A" } });
    fireEvent.click(screen.getByLabelText(/Aceito que a Igreja de Teste 1/));
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Ana" } });
    expect(submit).toBeEnabled();

    fireEvent.submit(submit.closest("form")!);
    expect(mockedPost).toHaveBeenCalledTimes(1);
  });

  it("envia o cadastro com telefone normalizado e mostra a mensagem da igreja", async () => {
    mockedPost.mockResolvedValue({
      data: { status: "registered", message: "Cadastro realizado! Bem-vindo à Igreja de Teste 1." },
    });
    await open();
    await fill("  Ana Souza  ");
    fireEvent.change(screen.getByLabelText("WhatsApp (opcional)"), {
      target: { value: "(11) 99999-0000" },
    });
    fireEvent.change(screen.getByLabelText("E-mail (opcional)"), { target: { value: " ana@x.com " } });
    fireEvent.change(screen.getByLabelText("Sexo (opcional)"), { target: { value: "female" } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Enviar cadastro" }));
    });

    expect(mockedPost).toHaveBeenCalledWith("/public/visitor/register", {
      token: "tok-1",
      full_name: "Ana Souza",
      phone: "11999990000",
      email: "ana@x.com",
      gender: "female",
      lgpd_consent: true,
    });
    expect(screen.getByRole("heading", { name: "Cadastro feito" })).toBeInTheDocument();
    expect(
      screen.getByText("Cadastro realizado! Bem-vindo à Igreja de Teste 1."),
    ).toBeInTheDocument();
  });

  it("campos opcionais vazios não vão no corpo; + do país é mantido", async () => {
    mockedPost.mockResolvedValue({ data: { status: "registered", message: "ok" } });
    await open();
    await fill();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Enviar cadastro" }));
    });
    expect(mockedPost).toHaveBeenLastCalledWith("/public/visitor/register", {
      token: "tok-1",
      full_name: "Ana Souza",
      phone: undefined,
      email: undefined,
      gender: undefined,
      lgpd_consent: true,
    });
  });

  it("quem já tinha visitado recebe as boas-vindas de volta", async () => {
    mockedPost.mockResolvedValue({
      data: { status: "visit_recorded", message: "Tudo certo, Ana! Sua presença foi registrada." },
    });
    await open();
    await fill();
    fireEvent.change(screen.getByLabelText("WhatsApp (opcional)"), {
      target: { value: "+55 11 99999-0000" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Enviar cadastro" }));
    });

    expect(mockedPost.mock.calls[0][1]).toEqual(expect.objectContaining({ phone: "+5511999990000" }));
    expect(screen.getByRole("heading", { name: "Que bom te ver de novo" })).toBeInTheDocument();
  });

  it("QR desativado no meio do caminho (404 no envio) troca para o aviso", async () => {
    mockedPost.mockRejectedValue(httpError(404));
    await open();
    await fill();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Enviar cadastro" }));
    });
    expect(screen.getByRole("heading", { name: "Este QR não está mais ativo" })).toBeInTheDocument();
  });

  it("limite de cadastros (429) explica e mantém o que foi digitado", async () => {
    mockedPost.mockRejectedValue(httpError(429));
    await open();
    await fill();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Enviar cadastro" }));
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Muitos cadastros seguidos nesta rede");
    expect(screen.getByLabelText("Nome")).toHaveValue("Ana Souza");
  });

  it("erro de validação mostra a mensagem da API", async () => {
    mockedPost.mockRejectedValue(httpError(400, "E-mail inválido"));
    await open();
    await fill();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Enviar cadastro" }));
    });
    expect(screen.getByRole("alert")).toHaveTextContent("E-mail inválido");
  });

  it("ignora a leitura do QR que chega depois de a página fechar", async () => {
    let resolve!: (value: unknown) => void;
    mockedGet.mockReturnValueOnce(new Promise((r) => (resolve = r)) as never);
    let view!: ReturnType<typeof render>;
    await act(async () => {
      view = render(<VisitanteAutocadastroPage />);
    });
    view.unmount();
    await act(async () => {
      resolve({ data: QR });
    });

    let reject!: (reason: unknown) => void;
    mockedGet.mockReturnValueOnce(new Promise((_, r) => (reject = r)) as never);
    await act(async () => {
      view = render(<VisitanteAutocadastroPage />);
    });
    view.unmount();
    await act(async () => {
      reject(httpError(404));
    });

    expect(mockedGet).toHaveBeenCalledTimes(2);
  });
});
