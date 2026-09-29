import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosError, AxiosHeaders } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TransferAccountModal } from "./TransferAccountModal";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({ default: { patch: vi.fn() } }));

const patchMock = vi.mocked(api.patch);
const onOpenChange = vi.fn();
const onTransferred = vi.fn();

const request = {
  accountId: "11111111-1111-4111-8111-111111111111",
  tenantId: "22222222-2222-4222-8222-222222222222",
  tenantName: "Teste 2 Church",
  congregationId: "33333333-3333-4333-8333-333333333333",
};

function apiError(status: number, message: unknown) {
  return new AxiosError("falhou", "ERR", undefined, undefined, {
    status,
    statusText: "",
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: { message },
  });
}

function montar() {
  return render(
    <TransferAccountModal
      open
      onOpenChange={onOpenChange}
      onTransferred={onTransferred}
      request={request}
    />
  );
}

beforeEach(() => {
  patchMock.mockReset();
  onOpenChange.mockReset();
  onTransferred.mockReset();
});

describe("TransferAccountModal", () => {
  it("declara as consequências antes de confirmar", () => {
    montar();

    expect(screen.getByText(/sessões da conta caem/)).toBeInTheDocument();
    expect(screen.getByText(/papéis que ela tinha/)).toBeInTheDocument();
    expect(screen.getByText(/registrada em audit_logs/)).toBeInTheDocument();
    expect(screen.getByText(/Teste 2 Church/)).toBeInTheDocument();
    expect(patchMock).not.toHaveBeenCalled();
  });

  it("confirmar chama o PATCH com o destino e devolve o resultado", async () => {
    const result = { user_account_id: request.accountId };
    patchMock.mockResolvedValue({ data: result } as never);
    const user = userEvent.setup();
    montar();

    await user.click(screen.getByRole("button", { name: "Transferir conta" }));

    await waitFor(() =>
      expect(patchMock).toHaveBeenCalledWith(
        `/platform/user-accounts/${request.accountId}/transfer`,
        {
          destination_tenant_id: request.tenantId,
          destination_congregation_id: request.congregationId,
        }
      )
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onTransferred).toHaveBeenCalledWith(result);
  });

  it.each([
    [400, "A conta já está no tenant de destino — transferência é um no-op inválido."],
    [404, "Tenant de destino 'x' não encontrado"],
  ])("mostra a mensagem da API no %i e mantém o modal aberto", async (status, message) => {
    patchMock.mockRejectedValue(apiError(status, message));
    const user = userEvent.setup();
    montar();

    await user.click(screen.getByRole("button", { name: "Transferir conta" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(onTransferred).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("validação do DTO (message em lista) vira texto genérico legível", async () => {
    patchMock.mockRejectedValue(apiError(400, ["destination_tenant_id must be a UUID"]));
    const user = userEvent.setup();
    montar();

    await user.click(screen.getByRole("button", { name: "Transferir conta" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Dados inválidos. Confira os IDs informados."
    );
  });

  it("403 e falha genérica têm mensagens próprias", async () => {
    patchMock.mockRejectedValueOnce(apiError(403, "Forbidden"));
    const user = userEvent.setup();
    montar();

    await user.click(screen.getByRole("button", { name: "Transferir conta" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/não tem permissão/);

    patchMock.mockRejectedValueOnce(new Error("rede"));
    await user.click(screen.getByRole("button", { name: "Transferir conta" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/falar com a API/)
    );
  });

  it("cancelar fecha sem chamar a API", async () => {
    const user = userEvent.setup();
    montar();

    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(patchMock).not.toHaveBeenCalled();
  });
});
