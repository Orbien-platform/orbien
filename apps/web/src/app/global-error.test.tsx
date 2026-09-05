import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import GlobalError from "./global-error";

describe("GlobalError", () => {
  it("mostra uma mensagem genérica de erro", () => {
    render(<GlobalError error={new Error("boom")} />);
    expect(screen.getByText("Algo deu errado.")).toBeInTheDocument();
  });
});
