import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChangePlanModal } from "./ChangePlanModal";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({ default: { patch: vi.fn() } }));

const patchMock = vi.mocked(api.patch);
const onOpenChange = vi.fn();
const onChanged = vi.fn();

const tenant = { id: "tenant-1", name: "Doca Church", plan: "starter" as const };

function montar() {
  return render(
    <ChangePlanModal
      open
      onOpenChange={onOpenChange}
      onChanged={onChanged}
      tenant={tenant}
    />
  );
}

beforeEach(() => {
  patchMock.mockReset().mockResolvedValue({ data: {} } as never);
  onOpenChange.mockReset();
  onChanged.mockReset();
});

describe("ChangePlanModal", () => {
  it("mostra os dois planos com o atual marcado", () => {
    montar();

    const starter = screen.getByRole("button", { name: /Starter/ });
    expect(starter).toHaveTextContent("Atual");
    expect(
      screen.getByRole("button", { name: /Premium/ })
    ).not.toHaveTextContent("Atual");
  });

  it("troca de plano chama o PATCH e recarrega", async () => {
    const user = userEvent.setup();
    montar();

    await user.click(screen.getByRole("button", { name: /Premium/ }));
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() =>
      expect(patchMock).toHaveBeenCalledWith("/platform/tenants/tenant-1/plan", {
        plan: "premium",
      })
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onChanged).toHaveBeenCalled();
  });

  it("selecionar o plano já atual fecha sem chamar a API", async () => {
    const user = userEvent.setup();
    montar();

    await user.click(screen.getByRole("button", { name: /Starter/ }));
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(patchMock).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("erro na API mostra mensagem e mantém o modal aberto", async () => {
    const user = userEvent.setup();
    patchMock.mockRejectedValue(new Error("500"));
    montar();

    await user.click(screen.getByRole("button", { name: /Premium/ }));
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível mudar o plano. Tente novamente."
    );
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("cancelar fecha sem chamar a API", async () => {
    const user = userEvent.setup();
    montar();

    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(patchMock).not.toHaveBeenCalled();
  });

  it("sem tenant, não tenta enviar", () => {
    render(
      <ChangePlanModal
        open
        onOpenChange={onOpenChange}
        onChanged={onChanged}
        tenant={null}
      />
    );

    // Sem tenant não há "Atual" pra clicar, mas o botão Salvar segue
    // desabilitado até algo ser selecionado.
    expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
    expect(patchMock).not.toHaveBeenCalled();
  });
});
