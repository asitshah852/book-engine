import { ImageResponse } from "next/og";

// iOS "Add to Home Screen" icon. iOS masks it to a rounded square automatically,
// so we render a full-bleed sky-blue tile with a big white "B".
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// The bundled default font ignores fontWeight, so we fake a heavy weight by
// ringing the glyph with white shadow copies — a reliable, font-independent bold.
const bold = (r: number) =>
  [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
  ]
    .flatMap(([dx, dy]) => [
      `${dx * r}px ${dy * r}px 0 #fff`,
      `${dx * r * 0.6}px ${dy * r * 0.6}px 0 #fff`,
    ])
    .join(", ");

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(150deg, #7dd3fc 0%, #0ea5e9 100%)",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 138,
            fontWeight: 900,
            color: "#ffffff",
            marginTop: -8,
            textShadow: bold(3.5),
          }}
        >
          B
        </div>
      </div>
    ),
    { ...size }
  );
}
