import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ContasPage from "./page";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), patch: vi.fn() } }));

const getMock = vi.mocked(api.get);
const patchMock = vi.mocked(api.patch);

const ACCOUNT = "11111111-1111-4111-8111-111111111111";
const TENANT = "22222222-2222-4222-8222-222222222222";
const CONGREGATION = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  getMock.mockReset().mockResolvedValue({
    data: {
      data: [
        { id: TENANT, slug: "teste2-church", name: "Teste 2 Church", is_active: true },
        { id: "inativo", slug: "velha", name: "Igreja Velha", is_active: false },
      ],
    },
  } as never);
  patchMock.mockReset();
});

async function preencher(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("ID da conta"), ACCOUNT);
  await user.selectOptions(
    await screen.findByRole("option", { name: /Teste 2 Church/ }).then(() =>
      screen.getByLabelText("Tenant de destino")
    ),
    TENANT
  );
  await user.type(screen.getByLabelText("ID da congregação de destino"), CONGREGATION);
}

describe("ContasPage", () => {
  it("lista só tenants ativos como destino", async () => {
    render(<ContasPage />);

    expect(await screen.findByRole("option", { name: /Teste 2 Church/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Igreja Velha/ })).not.toBeInTheDocument();
  });

  it("avisa quando os tenants não carregam", async () => {
    getMock.mockRejectedValue(new Error("x"));
    render(<ContasPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar os tenants de destino."
    );
  });

  it("recusa ID que não é UUID e não abre a confirmação", async () => {
    const user = userEvent.setup();
    render(<ContasPage />);

    await user.type(screen.getByLabelText("ID da conta"), "abc");
    await user.click(screen.getByRole("button", { name: "Revisar transferência" }));

    expect(screen.getByRole("alert")).toHaveTextContent(/ID da conta/);
    expect(screen.queryByText("Transferir esta conta?")).not.toBeInTheDocument();
  });

  it("exige tenant de destino", async () => {
    const user = userEvent.setup();
    render(<ContasPage />);

    await user.type(screen.getByLabelText("ID da conta"), ACCOUNT);
    await user.click(screen.getByRole("button", { name: "Revisar transferência" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Escolha o tenant de destino.");
  });

  it("fluxo completo: revisa, confirma e mostra o sucesso", async () => {
    patchMock.mockResolvedValue({
      data: { user_account_id: ACCOUNT, tenant_id: TENANT },
    } as never);
    const user = userEvent.setup();
    render(<ContasPage />);

    await preencher(user);
    await user.click(screen.getByRole("button", { name: "Revisar transferência" }));
    expect(await screen.findByText("Transferir esta conta?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Transferir conta" }));

    await waitFor(() =>
      expect(patchMock).toHaveBeenCalledWith(
        `/platform/user-accounts/${ACCOUNT}/transfer`,
        {
          destination_tenant_id: TENANT,
          destination_congregation_id: CONGREGATION,
        }
      )
    );
    expect(await screen.findByRole("status")).toHaveTextContent(/transferida/);
    expect(screen.getByLabelText("ID da conta")).toHaveValue("");
  });
});
