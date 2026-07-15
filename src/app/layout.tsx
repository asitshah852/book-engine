import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Your next 5 books",
  description:
    "Personalized book recommendations — verified, taste-matched picks based on the books you've loved.",
  applicationName: "Book Engine",
  // "Add to Home Screen" on iOS: launches full-screen (no Safari chrome) and
  // shows "Book Engine" as the icon label.
  appleWebApp: {
    capable: true,
    title: "Book Engine",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0ea5e9",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
