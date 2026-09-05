import { describe, expect, it, vi } from "vitest";
import { redirect } from "next/navigation";
import RootPage from "./page";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

describe("RootPage", () => {
  it("redireciona para /dashboard", () => {
    RootPage();
    expect(redirect).toHaveBeenCalledWith("/dashboard");
  });
});
