import { ImageResponse } from "next/og";

// Browser-tab favicon + PWA/manifest icon — same sky-blue "B" as the home-screen
// icon, at a higher resolution.
export const size = { width: 256, height: 256 };
export const contentType = "image/png";

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
            fontSize: 188,
            fontWeight: 800,
            color: "#ffffff",
            marginTop: -12,
          }}
        >
          B
        </div>
      </div>
    ),
    { ...size }
  );
}
