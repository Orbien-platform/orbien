import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@/hooks/useAuth";
import api from "@/lib/api";
import type { SessionUser } from "@/lib/session";
import { ProfileGapsGate } from "./ProfileGapsGate";

vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), patch: vi.fn() } }));

const USER: SessionUser = {
  id: "u1",
  name: "ana",
  email: "ana@example.com",
  roles: ["member"],
  tenant_id: "t1",
  congregation_id: "c1",
  support_session: false,
  support_tenant_name: null,
  areas: null,
  expires_at: Math.floor(Date.now() / 1000) + 900,
};

const logout = vi.fn(async () => {});

function setup(user: SessionUser | null = USER) {
  vi.mocked(useAuth).mockReturnValue({
    user,
    isLoading: false,
    isAuthenticated: !!user,
    login: vi.fn(),
    logout,
  });
}

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.patch).mockReset();
  logout.mockClear();
});

describe("ProfileGapsGate", () => {
  it("não abre quando nada falta", async () => {
    setup();
    vi.mocked(api.get).mockResolvedValue({ data: { missing: [] } });
    render(<ProfileGapsGate />);
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/me/profile-gaps"));
    expect(screen.queryByText("Confirme seus dados")).not.toBeInTheDocument();
  });

  it("não consulta em sessão de suporte", () => {
    setup({ ...USER, support_session: true });
    render(<ProfileGapsGate />);
    expect(api.get).not.toHaveBeenCalled();
  });

  it("falha na consulta não bloqueia a sessão", async () => {
    setup();
    vi.mocked(api.get).mockRejectedValue(new Error("rede"));
    render(<ProfileGapsGate />);
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(screen.queryByText("Confirme seus dados")).not.toBeInTheDocument();
  });

  it("pede só o que falta, sem botão de fechar, e envia ao salvar", async () => {
    setup();
    vi.mocked(api.get).mockResolvedValue({ data: { missing: ["phone", "birth_date"] } });
    vi.mocked(api.patch).mockResolvedValue({ data: {} });
    render(<ProfileGapsGate />);

    await screen.findByText("Confirme seus dados");
    expect(screen.queryByLabelText("Sexo")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Fechar")).not.toBeInTheDocument();

    const submit = screen.getByRole("button", { name: "Confirmar dados" });
    expect(submit).toBeDisabled();

    await userEvent.type(screen.getByLabelText("Telefone"), "11988887777");
    await userEvent.type(screen.getByLabelText("Data de nascimento"), "1990-05-01");
    expect(submit).toBeEnabled();
    await userEvent.click(submit);

    expect(api.patch).toHaveBeenCalledWith("/me", {
      phone: "11988887777",
      birth_date: "1990-05-01",
    });
    await waitFor(() =>
      expect(screen.queryByText("Confirme seus dados")).not.toBeInTheDocument(),
    );
  });

  it("falha ao salvar mantém o modal e avisa", async () => {
    setup();
    vi.mocked(api.get).mockResolvedValue({ data: { missing: ["gender"] } });
    vi.mocked(api.patch).mockRejectedValue(new Error("400"));
    render(<ProfileGapsGate />);

    await screen.findByText("Confirme seus dados");
    await userEvent.selectOptions(screen.getByLabelText("Sexo"), "female");
    await userEvent.click(screen.getByRole("button", { name: "Confirmar dados" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível salvar");
    expect(screen.getByText("Confirme seus dados")).toBeInTheDocument();
  });

  it("deixa sair da conta", async () => {
    setup();
    vi.mocked(api.get).mockResolvedValue({ data: { missing: ["gender"] } });
    render(<ProfileGapsGate />);
    await userEvent.click(await screen.findByRole("button", { name: "Sair da conta" }));
    expect(logout).toHaveBeenCalled();
  });
});
