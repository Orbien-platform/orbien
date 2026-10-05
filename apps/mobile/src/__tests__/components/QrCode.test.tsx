// QR em SVG: placa branca e módulo escuro dos tokens, nos dois modos, e um
// único Path para a matriz inteira.
import { render, screen } from "@testing-library/react-native";

import { QrCode, qrPath } from "../../components/QrCode";
import { qr } from "../../lib/theme/tokens";

describe("QrCode", () => {
  it("desenha a matriz do valor sobre a placa dos tokens", async () => {
    const view = await render(<QrCode testID="qr" value="orbien:checkin:abc" size={200} />);
    const { d, modules } = qrPath("orbien:checkin:abc");

    expect(screen.getByTestId("qr").props.accessibilityLabel).toBe("Código QR");
    const json = JSON.stringify(view.toJSON());
    expect(json).toContain(`"vbWidth":${modules}`);
    expect(json).toContain(d.slice(0, 40));
    expect(qr.plate).toBe("#FFFFFF");
  });

  it("aceita rótulo de acessibilidade próprio", async () => {
    await render(<QrCode testID="qr" value="x" size={100} accessibilityLabel="QR do culto" />);
    expect(screen.getByTestId("qr").props.accessibilityLabel).toBe("QR do culto");
  });

  it("valores diferentes geram matrizes diferentes", () => {
    expect(qrPath("a").d).not.toBe(qrPath("b").d);
  });
});
