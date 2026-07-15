import type { MetadataRoute } from "next";

// PWA manifest — makes it installable on Android too, with the sky-blue "B".
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Book Engine",
    short_name: "Book Engine",
    description:
      "Personalized, verified book recommendations based on the books you've loved.",
    start_url: "/",
    display: "standalone",
    background_color: "#0ea5e9",
    theme_color: "#0ea5e9",
    icons: [
      { src: "/icon", sizes: "256x256", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
