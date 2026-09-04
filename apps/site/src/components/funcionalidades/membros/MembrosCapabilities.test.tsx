import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MembrosCapabilities } from "@/components/funcionalidades/membros/MembrosCapabilities";

describe("MembrosCapabilities", () => {
  it("anuncia a seção pelo título", () => {
    render(<MembrosCapabilities />);
    expect(screen.getByRole("heading", { name: /Seis recursos que a secretária vai usar toda semana\./ })).toBeInTheDocument();
  });

  it("mostra o conteúdo da seção", () => {
    render(<MembrosCapabilities />);
    for (const texto of [
      "Cadastro em 30 segundos",
      "Deduplicação inteligente",
      "Acompanhamento de presença",
      "Perfil completo do membro",
      "Integração WhatsApp",
      "Ministérios e funções",
    ]) {
      expect(screen.getByText(texto)).toBeInTheDocument();
    }
  });
});
