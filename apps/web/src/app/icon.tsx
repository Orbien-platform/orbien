import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

// ImageResponse usa o Satori, que não lê variável CSS — os hex aqui são
// intencionais. Marca da direção Órbita (docs/design/orbita-v2, `OrbLogo` do
// protótipo): um anel com o satélite teal, sobre o fundo noturno `#05070F`.
// O anel é `--ink` (#F2F1EE) e o satélite é o teal da Orbien (#00E5C7).
// Os três apps (site, web, admin) usam este mesmo ícone.
// Geometria no viewBox 24×24 do `OrbLogo`: anel cx=12 cy=12 r=9, satélite
// cx=19 cy=9 r=2.2.
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#05070F",
          borderRadius: 8,
        }}
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke="#F2F1EE" strokeWidth="1.8" />
          <circle cx="19" cy="9" r="2.6" fill="#00E5C7" />
        </svg>
      </div>
    ),
    { ...size }
  );
}
