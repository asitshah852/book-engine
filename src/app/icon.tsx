import { ImageResponse } from "next/og";

// Browser-tab favicon + PWA/manifest icon — same sky-blue "B" as the home-screen
// icon, at a higher resolution.
export const size = { width: 256, height: 256 };
export const contentType = "image/png";

// Faux-bold (the bundled default font ignores fontWeight): ring the glyph with
// white shadow copies so the B reads heavy.
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

export default function Icon() {
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
            fontSize: 196,
            fontWeight: 900,
            color: "#ffffff",
            marginTop: -12,
            textShadow: bold(5),
          }}
        >
          B
        </div>
      </div>
    ),
    { ...size }
  );
}
