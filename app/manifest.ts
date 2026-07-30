import type { MetadataRoute } from "next";

// Android home-screen bookmarks read their icon from here. iOS ignores this and
// uses app/apple-icon.png instead.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "HoudiniMD",
    short_name: "HoudiniMD",
    description: "A fast, clutter-free markdown mirror of the Houdini docs.",
    start_url: "/",
    background_color: "#f8f8f8",
    theme_color: "#f05f04",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
