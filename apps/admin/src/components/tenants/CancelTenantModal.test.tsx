import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CancelTenantModal } from "./CancelTenantModal";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({ default: { post: vi.fn() } }));

const postMock = vi.mocked(api.post);
const onOpenChange = vi.fn();
const onCancelled = vi.fn();

const tenant = { id: "tenant-1", name: "Teste1 Church" };

function montar() {
  return render(
    <CancelTenantModal
      open
      onOpenChange={onOpenChange}
      onCancelled={onCancelled}
      tenant={tenant}
    />
  );
}

beforeEach(() => {
  postMock.mockReset().mockResolvedValue({ data: {} } as never);
  onOpenChange.mockReset();
  onCancelled.mockReset();
});

describe("CancelTenantModal", () => {
  it("explica o efeito na retenção e começa com o botão travado", () => {
    montar();

    expect(screen.getByText(/contagem de retenção/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar plano" })).toBeDisabled();
  });

  it("nome digitado errado mantém o botão travado", async () => {
    const user = userEvent.setup();
    montar();

    await user.type(screen.getByLabelText("Nome do tenant para confirmar"), "Teste1");

    expect(screen.getByRole("button", { name: "Cancelar plano" })).toBeDisabled();
  });

  it("com o nome exato, chama o POST, fecha e recarrega", async () => {
    const user = userEvent.setup();
    montar();

    await user.type(
      screen.getByLabelText("Nome do tenant para confirmar"),
      "Teste1 Church"
    );
    await user.click(screen.getByRole("button", { name: "Cancelar plano" }));

    await waitFor(() =>
      expect(postMock).toHaveBeenCalledWith("/platform/tenants/tenant-1/cancel")
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onCancelled).toHaveBeenCalled();
  });

  it("erro na API mostra mensagem e mantém o modal aberto", async () => {
    const user = userEvent.setup();
    postMock.mockRejectedValue(new Error("500"));
    montar();

    await user.type(
      screen.getByLabelText("Nome do tenant para confirmar"),
      "Teste1 Church"
    );
    await user.click(screen.getByRole("button", { name: "Cancelar plano" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível cancelar o plano. Tente novamente."
    );
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(onCancelled).not.toHaveBeenCalled();
  });

  it("voltar fecha sem chamar a API", async () => {
    const user = userEvent.setup();
    montar();

    await user.click(screen.getByRole("button", { name: "Voltar" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(postMock).not.toHaveBeenCalled();
  });

  it("fechar pelo X com o envio em voo não descarta o modal", async () => {
    const user = userEvent.setup();
    postMock.mockReturnValue(new Promise(() => {}));
    montar();

    await user.type(
      screen.getByLabelText("Nome do tenant para confirmar"),
      "Teste1 Church"
    );
    await user.click(screen.getByRole("button", { name: "Cancelar plano" }));
    await user.click(await screen.findByRole("button", { name: "Fechar" }));

    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("sem tenant, o botão segue travado e nada é enviado", () => {
    render(
      <CancelTenantModal
        open
        onOpenChange={onOpenChange}
        onCancelled={onCancelled}
        tenant={null}
      />
    );

    expect(screen.getByRole("button", { name: "Cancelar plano" })).toBeDisabled();
    expect(postMock).not.toHaveBeenCalled();
  });
});
