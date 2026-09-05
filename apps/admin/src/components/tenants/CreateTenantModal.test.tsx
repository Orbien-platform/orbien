import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosError, AxiosHeaders } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CreateTenantModal } from "./CreateTenantModal";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({ default: { post: vi.fn() } }));

const postMock = vi.mocked(api.post);
const onOpenChange = vi.fn();
const onCreated = vi.fn();

function axiosError(status: number) {
  const headers = new AxiosHeaders();
  const config = { headers };
  return new AxiosError("falhou", "ERR_BAD_REQUEST", config, null, {
    status,
    statusText: "",
    data: {},
    headers,
    config,
  });
}

function montar() {
  return render(
    <CreateTenantModal
      open
      onOpenChange={onOpenChange}
      onCreated={onCreated}
    />
  );
}

async function preencher(
  user: ReturnType<typeof userEvent.setup>,
  overrides: Partial<Record<string, string>> = {}
) {
  const valores: Record<string, string> = {
    "Nome da igreja": "Igreja Nova",
    Slug: "igreja-nova",
    "Congregação sede": "Igreja Nova — Sede",
    "E-mail do admin": "pastor@igreja-nova.com",
    "Senha inicial": "senha12345",
    ...overrides,
  };

  for (const [rotulo, valor] of Object.entries(valores)) {
    const campo = screen.getByLabelText(rotulo);
    await user.clear(campo);
    if (valor) await user.type(campo, valor);
  }
}

beforeEach(() => {
  postMock.mockReset().mockResolvedValue({ data: {} } as never);
  onOpenChange.mockReset();
  onCreated.mockReset();
});

describe("CreateTenantModal", () => {
  it("explica o que a criação faz", () => {
    montar();

    expect(screen.getByText("Novo tenant")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Cria a igreja, o plano em trial, a congregação sede e a conta do primeiro admin."
      )
    ).toBeInTheDocument();
  });

  it("cria o tenant com os campos aparados e o slug em minúsculas", async () => {
    const user = userEvent.setup();
    montar();

    await preencher(user, { Slug: "  Igreja-Nova  " });
    await user.click(screen.getByRole("button", { name: "Criar tenant" }));

    await waitFor(() =>
      expect(postMock).toHaveBeenCalledWith("/platform/tenants", {
        slug: "igreja-nova",
        name: "Igreja Nova",
        congregation_name: "Igreja Nova — Sede",
        admin_email: "pastor@igreja-nova.com",
        admin_password: "senha12345",
      })
    );
    // Criou: fecha e avisa a lista.
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onCreated).toHaveBeenCalled();
  });

  it("inclui o e-mail de contato só quando preenchido", async () => {
    const user = userEvent.setup();
    montar();

    await preencher(user);
    await user.type(
      screen.getByLabelText("E-mail de contato (opcional)"),
      " contato@igreja-nova.com "
    );
    await user.click(screen.getByRole("button", { name: "Criar tenant" }));

    await waitFor(() =>
      expect(postMock.mock.calls[0][1]).toMatchObject({
        email: "contato@igreja-nova.com",
      })
    );
  });

  it("recusa slug fora do formato antes de chamar a API", async () => {
    const user = userEvent.setup();
    montar();

    await preencher(user, { Slug: "Igreja Nova!" });
    await user.click(screen.getByRole("button", { name: "Criar tenant" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Slug: só minúsculas, números e hífens, a partir de 3 caracteres."
    );
    expect(postMock).not.toHaveBeenCalled();
  });

  it("recusa slug curto demais", async () => {
    const user = userEvent.setup();
    montar();

    await preencher(user, { Slug: "ab" });
    await user.click(screen.getByRole("button", { name: "Criar tenant" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Slug:");
    expect(postMock).not.toHaveBeenCalled();
  });

  it("recusa senha inicial com menos de 8 caracteres", async () => {
    const user = userEvent.setup();
    montar();

    await preencher(user, { "Senha inicial": "1234567" });
    await user.click(screen.getByRole("button", { name: "Criar tenant" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "A senha do admin precisa de ao menos 8 caracteres."
    );
    expect(postMock).not.toHaveBeenCalled();
  });

  it("409 vira aviso de slug já usado, com o slug na mensagem", async () => {
    const user = userEvent.setup();
    postMock.mockRejectedValue(axiosError(409));
    montar();

    await preencher(user);
    await user.click(screen.getByRole("button", { name: "Criar tenant" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      'Já existe um tenant com o slug "igreja-nova".'
    );
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("400 pede revisão dos campos e qualquer outro erro vira mensagem genérica", async () => {
    const user = userEvent.setup();
    postMock.mockRejectedValue(axiosError(400));
    const { unmount } = montar();

    await preencher(user);
    await user.click(screen.getByRole("button", { name: "Criar tenant" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Dados inválidos. Revise os campos."
    );
    unmount();

    postMock.mockRejectedValue(new Error("ECONNREFUSED"));
    montar();
    await preencher(user);
    await user.click(screen.getByRole("button", { name: "Criar tenant" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível criar o tenant. Tente novamente."
    );
  });

  it("enquanto envia, os campos e os dois botões ficam travados", async () => {
    const user = userEvent.setup();
    let liberar!: (v: unknown) => void;
    postMock.mockImplementation(
      () => new Promise((resolve) => (liberar = resolve)) as never
    );
    montar();

    await preencher(user);
    await user.click(screen.getByRole("button", { name: "Criar tenant" }));

    expect(await screen.findByText("Criando…")).toBeInTheDocument();
    expect(screen.getByLabelText("Slug")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();

    liberar({ data: {} });
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
  });

  it("cancelar fecha e limpa o formulário", async () => {
    const user = userEvent.setup();
    const { rerender } = montar();

    await preencher(user);
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(postMock).not.toHaveBeenCalled();

    // Reabrir mostra o formulário vazio.
    rerender(
      <CreateTenantModal open onOpenChange={onOpenChange} onCreated={onCreated} />
    );
    expect(screen.getByLabelText("Slug")).toHaveValue("");
  });

  it("fechar pelo X passa pelo mesmo caminho de limpeza", async () => {
    const user = userEvent.setup();
    montar();

    await preencher(user, { Slug: "igreja-nova" });
    await user.click(screen.getByRole("button", { name: "Fechar" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("o slug avisa que não muda depois", () => {
    montar();

    expect(
      screen.getByText("Vira subdomínio, login e branding. Não muda depois.")
    ).toBeInTheDocument();
  });
});
