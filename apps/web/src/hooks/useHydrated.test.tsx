import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { useHydrated } from "./useHydrated";

function Probe() {
  return <>{String(useHydrated())}</>;
}

describe("useHydrated", () => {
  it("é true depois de montar no cliente", () => {
    const { result } = renderHook(() => useHydrated());

    expect(result.current).toBe(true);
  });

  it("é false na renderização do servidor", () => {
    expect(renderToString(<Probe />)).toBe("false");
  });
});
