import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// ImageResponse uses Satori which does not support CSS variables —
// hex values are intentional and acceptable here.
// Versão de fundo escuro: navy (`--color-navy`) no fundo, órbita e núcleo em
// `--navy-tint`, e o teal claro (`--color-teal-dark`) que é o do modo escuro.
// Os três apps (site, web, admin) usam este mesmo ícone.
// Geometry: original SVG viewBox 22×22, scaled ×6.36 and centered in 180px.
//   Ellipse  cx=11,cy=11,rx=9,ry=4   → width=114, height=51, top=64, left=33
//   Center   cx=11,cy=11,r=3         → ⌀38, top=71, left=71
//   Teal     cx=20,cy=11,r=2         → ⌀25, top=77, left=135
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
          background: "#1E3A7B",
          position: "relative",
        }}
      >
        {/* Orbit ellipse */}
        <div
          style={{
            position: "absolute",
            width: 114,
            height: 51,
            borderRadius: "50%",
            border: "2px solid #F0F3FA",
            top: 64,
            left: 33,
          }}
        />
        {/* Center dot */}
        <div
          style={{
            position: "absolute",
            width: 38,
            height: 38,
            borderRadius: "50%",
            background: "#F0F3FA",
            top: 71,
            left: 71,
          }}
        />
        {/* Teal accent dot */}
        <div
          style={{
            position: "absolute",
            width: 25,
            height: 25,
            borderRadius: "50%",
            background: "#00CDB5",
            top: 77,
            left: 135,
          }}
        />
      </div>
    ),
    { ...size }
  );
}
