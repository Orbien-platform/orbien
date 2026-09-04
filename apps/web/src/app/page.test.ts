import { describe, expect, it, vi } from "vitest";
import { redirect } from "next/navigation";
import RootPage from "./page";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

describe("RootPage", () => {
  it("manda a raiz para o dashboard", () => {
    RootPage();
    expect(vi.mocked(redirect)).toHaveBeenCalledWith("/dashboard");
  });
});
