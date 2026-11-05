import { render, screen } from "@testing-library/react";
import { QrImage } from "./QrImage";

describe("QrImage", () => {
  it("desenha o QR em SVG com o rótulo acessível", () => {
    render(<QrImage value="https://exemplo.com/visitante/igreja/abc" label="QR do culto" size={200} />);
    const svg = screen.getByRole("img", { name: "QR do culto" });
    expect(svg.tagName.toLowerCase()).toBe("svg");
    expect(svg.getAttribute("width")).toBe("200");
    expect(svg.querySelector("path")?.getAttribute("d")?.length).toBeGreaterThan(100);
  });

  it("valores diferentes geram desenhos diferentes", () => {
    const { rerender } = render(<QrImage value="a" />);
    const first = screen.getByRole("img").querySelector("path")?.getAttribute("d");
    rerender(<QrImage value="outro valor bem maior" />);
    expect(screen.getByRole("img").querySelector("path")?.getAttribute("d")).not.toBe(first);
  });
});
