import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SupportSessionBanner } from "./SupportSessionBanner";

const SUPPORT_TOKEN =
  "eyJhbGciOiAibm9uZSIsICJ0eXAiOiAiSldUIn0.eyJzdWIiOiAidTEiLCAidGVuYW50X2lkIjogInQxIiwgImNvbmdyZWdhdGlvbl9pZCI6ICJjMSIsICJyb2xlcyI6IFsicGxhdGZvcm1fc3VwcG9ydCJdLCAicGxhbiI6ICJwcm8iLCAiaWF0IjogMCwgImV4cCI6IDk5OTk5OTk5OTksICJzdXBwb3J0X3Nlc3Npb24iOiB0cnVlfQ.sig";
const NORMAL_TOKEN =
  "eyJhbGciOiAibm9uZSIsICJ0eXAiOiAiSldUIn0.eyJzdWIiOiAidTEiLCAidGVuYW50X2lkIjogInQxIiwgImNvbmdyZWdhdGlvbl9pZCI6ICJjMSIsICJyb2xlcyI6IFsidGVuYW50X2FkbWluIl0sICJwbGFuIjogInBybyIsICJpYXQiOiAwLCAiZXhwIjogOTk5OTk5OTk5OX0.sig";

afterEach(() => {
  localStorage.clear();
});

describe("SupportSessionBanner", () => {
  it("não renderiza nada quando não há sessão de suporte", () => {
    render(<SupportSessionBanner />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("não renderiza quando o marcador está presente mas o token não é de suporte", () => {
    localStorage.setItem("support_session", "1");
    localStorage.setItem("access_token", NORMAL_TOKEN);
    render(<SupportSessionBanner />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("renderiza a faixa quando a sessão é de suporte, com o nome do tenant", () => {
    localStorage.setItem("support_session", "1");
    localStorage.setItem("access_token", SUPPORT_TOKEN);
    localStorage.setItem("support_session_tenant", "Igreja Vida Nova");
    render(<SupportSessionBanner />);
    const banner = screen.getByRole("status");
    expect(banner).toHaveTextContent("Sessão de suporte da plataforma");
    expect(banner).toHaveTextContent("Igreja Vida Nova");
    expect(banner).toHaveTextContent("Toda ação fica");
  });

  it("renderiza a faixa sem nome de tenant quando ele não está salvo", () => {
    localStorage.setItem("support_session", "1");
    localStorage.setItem("access_token", SUPPORT_TOKEN);
    render(<SupportSessionBanner />);
    const banner = screen.getByRole("status");
    expect(banner).toHaveTextContent("Sessão de suporte da plataforma.");
  });
});
