import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosError, AxiosHeaders } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EditTenantModal } from "./EditTenantModal";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({ default: { patch: vi.fn() } }));

const patchMock = vi.mocked(api.patch);
const onOpenChange = vi.fn();
const onUpdated = vi.fn();

const tenant = { id: "tenant-1", name: "Doca Church", email: "contato@doca.church" };

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
    <EditTenantModal
      open
      onOpenChange={onOpenChange}
      onUpdated={onUpdated}
      tenant={tenant}
    />
  );
}

beforeEach(() => {
  patchMock.mockReset().mockResolvedValue({ data: {} } as never);
  onOpenChange.mockReset();
  onUpdated.mockReset();
});

describe("EditTenantModal", () => {
  it("vem preenchido com o nome e o e-mail do tenant", () => {
    montar();

    expect(screen.getByLabelText("Nome da igreja")).toHaveValue("Doca Church");
    expect(screen.getByLabelText("E-mail de contato")).toHaveValue(
      "contato@doca.church"
    );
  });

  it("salva o nome e o e-mail aparados", async () => {
    const user = userEvent.setup();
    montar();

    fireEvent.change(screen.getByLabelText("Nome da igreja"), {
      target: { value: "  Doca Church Renovada  " },
    });
    fireEvent.change(screen.getByLabelText("E-mail de contato"), {
      target: { value: "  novo@doca.church  " },
    });
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() =>
      expect(patchMock).toHaveBeenCalledWith("/platform/tenants/tenant-1", {
        name: "Doca Church Renovada",
        email: "novo@doca.church",
      })
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onUpdated).toHaveBeenCalled();
  });

  it("e-mail limpo não vai no PATCH — o DTO não aceita string vazia", async () => {
    const user = userEvent.setup();
    montar();

    fireEvent.change(screen.getByLabelText("E-mail de contato"), {
      target: { value: "" },
    });
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() =>
      expect(patchMock).toHaveBeenCalledWith("/platform/tenants/tenant-1", {
        name: "Doca Church",
      })
    );
  });

  it("recusa nome vazio antes de chamar a API", async () => {
    const user = userEvent.setup();
    montar();

    fireEvent.change(screen.getByLabelText("Nome da igreja"), {
      target: { value: " " },
    });
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Informe o nome da igreja."
    );
    expect(patchMock).not.toHaveBeenCalled();
  });

  it("404 avisa que o tenant não existe mais", async () => {
    const user = userEvent.setup();
    patchMock.mockRejectedValue(axiosError(404));
    montar();

    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Este tenant não existe mais."
    );
    expect(onUpdated).not.toHaveBeenCalled();
  });

  it("400 pede revisão dos campos", async () => {
    const user = userEvent.setup();
    patchMock.mockRejectedValue(axiosError(400));
    montar();

    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Dados inválidos. Revise os campos."
    );
  });

  it("qualquer outro erro vira mensagem genérica", async () => {
    const user = userEvent.setup();
    patchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    montar();

    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível salvar. Tente novamente."
    );
  });

  it("cancelar fecha sem chamar a API", async () => {
    const user = userEvent.setup();
    montar();

    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(patchMock).not.toHaveBeenCalled();
  });

  it("fechar pelo X passa pelo mesmo caminho de limpeza", async () => {
    const user = userEvent.setup();
    montar();

    await user.click(screen.getByRole("button", { name: "Fechar" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(patchMock).not.toHaveBeenCalled();
  });

  it("sem tenant, não tenta enviar", async () => {
    const user = userEvent.setup();
    render(
      <EditTenantModal
        open
        onOpenChange={onOpenChange}
        onUpdated={onUpdated}
        tenant={null}
      />
    );

    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(patchMock).not.toHaveBeenCalled();
  });
});
