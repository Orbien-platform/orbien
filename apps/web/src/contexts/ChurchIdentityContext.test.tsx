import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@/hooks/useAuth";
import api from "@/lib/api";
import { ChurchIdentityProvider, useChurchIdentity } from "./ChurchIdentityContext";

vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("@/lib/api", () => ({ default: { get: vi.fn() } }));

const mockedUseAuth = vi.mocked(useAuth);
const mockedGet = vi.mocked(api.get);

function signedIn(signed: boolean) {
  mockedUseAuth.mockReturnValue({
    user: signed ? ({ id: "u1" } as ReturnType<typeof useAuth>["user"]) : null,
    isLoading: false,
    isAuthenticated: signed,
    login: vi.fn(),
    logout: vi.fn(),
  });
}

function Probe() {
  const { churchName, congregationName, groupTerm } = useChurchIdentity();
  return (
    <>
      <p>
        {churchName ?? "sem-igreja"} / {congregationName ?? "sem-congregacao"}
      </p>
      <p>
        termo: {groupTerm.singular} / {groupTerm.plural}
      </p>
    </>
  );
}

function settings(
  primary_color: string | null,
  terms: { group_term_singular?: string | null; group_term_plural?: string | null } = {}
) {
  return {
    data: {
      tenant: { name: "Igreja Teste Um" },
      congregation: { name: "Sede" },
      branding: { primary_color, ...terms },
    },
  };
}

describe("ChurchIdentityProvider", () => {
  beforeEach(() => {
    mockedGet.mockReset();
  });
  afterEach(() => {
    document.documentElement.style.removeProperty("--brand");
  });

  it("expõe o nome da igreja e da congregação e aplica a cor da marca", async () => {
    signedIn(true);
    mockedGet.mockResolvedValue(settings("#7a1e5b"));
    render(
      <ChurchIdentityProvider>
        <Probe />
      </ChurchIdentityProvider>
    );

    expect(await screen.findByText("Igreja Teste Um / Sede")).toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledWith("/settings");
    expect(document.documentElement.style.getPropertyValue("--brand")).toBe("#7a1e5b");
  });

  it("ignora cor que não é hexadecimal de seis dígitos", async () => {
    signedIn(true);
    mockedGet.mockResolvedValue(settings("red; background: url(x)"));
    render(
      <ChurchIdentityProvider>
        <Probe />
      </ChurchIdentityProvider>
    );

    await screen.findByText("Igreja Teste Um / Sede");
    expect(document.documentElement.style.getPropertyValue("--brand")).toBe("");
  });

  it("traz o termo da igreja para pequeno grupo", async () => {
    signedIn(true);
    mockedGet.mockResolvedValue(
      settings(null, { group_term_singular: "Célula", group_term_plural: "Células" })
    );
    render(
      <ChurchIdentityProvider>
        <Probe />
      </ChurchIdentityProvider>
    );

    expect(await screen.findByText("termo: Célula / Células")).toBeInTheDocument();
  });

  it("sem termo configurado, usa Grupo / Grupos", async () => {
    signedIn(true);
    mockedGet.mockResolvedValue(settings(null));
    render(
      <ChurchIdentityProvider>
        <Probe />
      </ChurchIdentityProvider>
    );

    await screen.findByText("Igreja Teste Um / Sede");
    expect(screen.getByText("termo: Grupo / Grupos")).toBeInTheDocument();
  });

  it("sem sessão não chama a API e fica no fallback", () => {
    signedIn(false);
    render(
      <ChurchIdentityProvider>
        <Probe />
      </ChurchIdentityProvider>
    );

    expect(mockedGet).not.toHaveBeenCalled();
    expect(screen.getByText("sem-igreja / sem-congregacao")).toBeInTheDocument();
  });

  it("falha da API não quebra: fica no fallback", async () => {
    signedIn(true);
    mockedGet.mockRejectedValue(new Error("rede"));
    render(
      <ChurchIdentityProvider>
        <Probe />
      </ChurchIdentityProvider>
    );

    await waitFor(() => expect(mockedGet).toHaveBeenCalled());
    expect(screen.getByText("sem-igreja / sem-congregacao")).toBeInTheDocument();
  });
});
