import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// ImageResponse usa o Satori, que não lê variável CSS — os hex aqui são
// intencionais. Marca da direção Órbita (docs/design/orbita-v2, `OrbLogo` do
// protótipo): um anel com o satélite teal, sobre o fundo noturno `#05070F`,
// com o brilho da cor da marca atrás do anel — o mesmo do hero do site.
// Sem cantos arredondados: o iOS aplica a própria máscara.
// Os três apps (site, web, admin) usam este mesmo ícone.
// Geometria no viewBox 24×24 do `OrbLogo`: anel cx=12 cy=12 r=9, satélite
// cx=19 cy=9 r=2.2.
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "radial-gradient(circle at 50% 50%, #1B2A55 0%, #05070F 62%)",
        }}
      >
        <svg width="120" height="120" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke="#F2F1EE" strokeWidth="1.4" />
          <circle cx="19" cy="9" r="3.6" fill="#00E5C7" opacity="0.25" />
          <circle cx="19" cy="9" r="2.2" fill="#00E5C7" />
        </svg>
      </div>
    ),
    { ...size }
  );
}
