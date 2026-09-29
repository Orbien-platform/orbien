import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReactivateTenantModal } from "./ReactivateTenantModal";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({ default: { post: vi.fn() } }));

const postMock = vi.mocked(api.post);
const onOpenChange = vi.fn();
const onReactivated = vi.fn();

function montar() {
  return render(
    <ReactivateTenantModal
      open
      onOpenChange={onOpenChange}
      onReactivated={onReactivated}
      tenant={{ id: "tenant-2", name: "Teste2 Church" }}
    />
  );
}

beforeEach(() => {
  postMock.mockReset().mockResolvedValue({ data: {} } as never);
  onOpenChange.mockReset();
  onReactivated.mockReset();
});

describe("ReactivateTenantModal", () => {
  it("confirmar chama o POST, fecha e recarrega", async () => {
    const user = userEvent.setup();
    montar();

    await user.click(screen.getByRole("button", { name: "Reativar plano" }));

    await waitFor(() =>
      expect(postMock).toHaveBeenCalledWith("/platform/tenants/tenant-2/reactivate")
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onReactivated).toHaveBeenCalled();
  });

  it("erro na API mostra mensagem e mantém o modal aberto", async () => {
    const user = userEvent.setup();
    postMock.mockRejectedValue(new Error("500"));
    montar();

    await user.click(screen.getByRole("button", { name: "Reativar plano" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível reativar o plano. Tente novamente."
    );
    expect(onReactivated).not.toHaveBeenCalled();
  });

  it("voltar fecha sem chamar a API", async () => {
    const user = userEvent.setup();
    montar();

    await user.click(screen.getByRole("button", { name: "Voltar" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(postMock).not.toHaveBeenCalled();
  });
});
