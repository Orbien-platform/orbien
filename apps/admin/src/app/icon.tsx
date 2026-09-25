import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

// ImageResponse uses Satori which does not support CSS variables —
// hex values are intentional and acceptable here.
// Versão de fundo escuro: navy (`--color-navy`) no fundo, órbita e núcleo em
// `--navy-tint`, e o teal claro (`--color-teal-dark`) que é o do modo escuro.
// Os três apps (site, web, admin) usam este mesmo ícone.
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
          background: "#1E3A7B",
          borderRadius: 7,
          position: "relative",
        }}
      >
        {/* Orbit ellipse */}
        <div
          style={{
            position: "absolute",
            width: 20,
            height: 9,
            borderRadius: "50%",
            border: "1.5px solid #F0F3FA",
            top: 11,
            left: 6,
          }}
        />
        {/* Center dot */}
        <div
          style={{
            position: "absolute",
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: "#F0F3FA",
            top: 12,
            left: 12,
          }}
        />
        {/* Teal accent dot */}
        <div
          style={{
            position: "absolute",
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: "#00CDB5",
            top: 13,
            left: 23,
          }}
        />
      </div>
    ),
    { ...size }
  );
}
