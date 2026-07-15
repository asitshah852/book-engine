import { ImageResponse } from "next/og";

// iOS "Add to Home Screen" icon. iOS masks it to a rounded square automatically,
// so we render a full-bleed sky-blue tile with a big white "B".
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

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
            fontSize: 132,
            fontWeight: 800,
            color: "#ffffff",
            marginTop: -8,
          }}
        >
          B
        </div>
      </div>
    ),
    { ...size }
  );
}
