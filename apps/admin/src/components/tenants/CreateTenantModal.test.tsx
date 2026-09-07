import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

/**
 * Preenche os cinco campos obrigatórios de uma vez.
 *
 * `fireEvent.change` em vez de `user.type`: são ~60 teclas por chamada, e no
 * runner do CI (2 vCPUs) isso estourava o timeout de 5s — o teste falhava por
 * tempo de digitação, não por comportamento. O caminho de digitação de
 * verdade continua coberto pelo `it` que digita o slug tecla a tecla.
 */
function preencher(overrides: Partial<Record<string, string>> = {}) {
  const valores: Record<string, string> = {
    "Nome da igreja": "Igreja Nova",
    Slug: "igreja-nova",
    "Congregação sede": "Igreja Nova — Sede",
    "E-mail do admin": "pastor@igreja-nova.com",
    "Senha inicial": "senha12345",
    ...overrides,
  };

  for (const [rotulo, valor] of Object.entries(valores)) {
    fireEvent.change(screen.getByLabelText(rotulo), {
      target: { value: valor },
    });
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

    preencher({ Slug: "  Igreja-Nova  " });
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

    preencher();
    fireEvent.change(screen.getByLabelText("E-mail de contato (opcional)"), {
      target: { value: " contato@igreja-nova.com " },
    });
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

    preencher({ Slug: "Igreja Nova!" });
    await user.click(screen.getByRole("button", { name: "Criar tenant" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Slug: só minúsculas, números e hífens, a partir de 3 caracteres."
    );
    expect(postMock).not.toHaveBeenCalled();
  });

  it("recusa slug curto demais", async () => {
    const user = userEvent.setup();
    montar();

    preencher({ Slug: "ab" });
    await user.click(screen.getByRole("button", { name: "Criar tenant" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Slug:");
    expect(postMock).not.toHaveBeenCalled();
  });

  it("recusa senha inicial com menos de 8 caracteres", async () => {
    const user = userEvent.setup();
    montar();

    preencher({ "Senha inicial": "1234567" });
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

    preencher();
    await user.click(screen.getByRole("button", { name: "Criar tenant" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      'Já existe um tenant com o slug "igreja-nova".'
    );
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("400 pede revisão dos campos", async () => {
    const user = userEvent.setup();
    postMock.mockRejectedValue(axiosError(400));
    montar();

    preencher();
    await user.click(screen.getByRole("button", { name: "Criar tenant" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Dados inválidos. Revise os campos."
    );
  });

  it("qualquer outro erro vira mensagem genérica", async () => {
    const user = userEvent.setup();
    postMock.mockRejectedValue(new Error("ECONNREFUSED"));
    montar();

    preencher();
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

    preencher();
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

    preencher();
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

    preencher({ Slug: "igreja-nova" });
    await user.click(screen.getByRole("button", { name: "Fechar" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("o slug digitado tecla a tecla chega normalizado à API", async () => {
    const user = userEvent.setup();
    montar();

    // O único teste que passa pelo `user.type`: prova que o `onChange` do
    // campo controlado acompanha a digitação real, sem pagar isso em todos.
    preencher({ Slug: "" });
    await user.type(screen.getByLabelText("Slug"), "Igreja-Nova");
    await user.click(screen.getByRole("button", { name: "Criar tenant" }));

    await waitFor(() =>
      expect(postMock.mock.calls[0][1]).toMatchObject({ slug: "igreja-nova" })
    );
  });

  it("o slug avisa que não muda depois", () => {
    montar();

    expect(
      screen.getByText("Vira subdomínio, login e branding. Não muda depois.")
    ).toBeInTheDocument();
  });
});

describe("CreateTenantModal — a partir de um lead da waitlist", () => {
  const lead = {
    id: "lead-1",
    email: "pastor@igreja-nova.com",
    pastor_name: "Pastor João",
    church_name: "Igreja Nova",
  };

  function montarComLead() {
    return render(
      <CreateTenantModal
        open
        onOpenChange={onOpenChange}
        onCreated={onCreated}
        lead={lead}
      />
    );
  }

  it("prefille nome, slug, congregação e e-mail do admin a partir do lead", () => {
    montarComLead();

    expect(screen.getByLabelText("Nome da igreja")).toHaveValue("Igreja Nova");
    expect(screen.getByLabelText("Slug")).toHaveValue("igreja-nova");
    expect(screen.getByLabelText("Congregação sede")).toHaveValue(
      "Igreja Nova — Sede"
    );
    expect(screen.getByLabelText("E-mail do admin")).toHaveValue(
      "pastor@igreja-nova.com"
    );
  });

  it("sem nome de igreja, usa o nome do pastor", () => {
    render(
      <CreateTenantModal
        open
        onOpenChange={onOpenChange}
        onCreated={onCreated}
        lead={{ ...lead, church_name: null }}
      />
    );

    expect(screen.getByLabelText("Nome da igreja")).toHaveValue("Pastor João");
  });

  it("envia waitlist_lead_id no POST", async () => {
    const user = userEvent.setup();
    montarComLead();

    fireEvent.change(screen.getByLabelText("Senha inicial"), {
      target: { value: "senha12345" },
    });
    await user.click(screen.getByRole("button", { name: "Provisionar" }));

    await waitFor(() =>
      expect(postMock.mock.calls[0][1]).toMatchObject({
        waitlist_lead_id: "lead-1",
      })
    );
  });

  it("explica que o lead será marcado como ativado", () => {
    montarComLead();

    expect(screen.getByText("Provisionar a partir do lead")).toBeInTheDocument();
    expect(
      screen.getByText(/marca este lead da waitlist como ativado/)
    ).toBeInTheDocument();
  });

  it("409 do lead já provisionado por outra aba vira mensagem própria", async () => {
    const user = userEvent.setup();
    const err = axiosError(409);
    (err.response as { data: unknown }).data = {
      message: "Lead 'lead-1' já está vinculado a outro tenant.",
    };
    postMock.mockRejectedValue(err);
    montarComLead();

    fireEvent.change(screen.getByLabelText("Senha inicial"), {
      target: { value: "senha12345" },
    });
    await user.click(screen.getByRole("button", { name: "Provisionar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Este lead já foi provisionado para outro tenant."
    );
  });
});
