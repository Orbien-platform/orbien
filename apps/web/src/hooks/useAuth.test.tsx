import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { AuthContext, type AuthContextType } from "@/contexts/AuthContext";
import { useAuth } from "./useAuth";

const contextValue: AuthContextType = {
  user: null,
  isLoading: false,
  isAuthenticated: false,
  login: async () => {},
  logout: async () => {},
};

describe("useAuth", () => {
  it("retorna o contexto quando dentro do AuthProvider", () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current).toBe(contextValue);
  });

  it("lança erro quando usado fora do AuthProvider", () => {
    expect(() => renderHook(() => useAuth())).toThrow(
      "useAuth must be used within AuthProvider"
    );
  });
});
