import { copyFileSync } from "node:fs";

// GitHub Pages does not do SPA fallback routing, so a direct visit to /leads
// (or any client-side route) would otherwise 404. Copying index.html to
// 404.html makes GitHub Pages serve the app for unknown paths, and
// react-router renders the correct route from the pathname.
copyFileSync("dist/index.html", "dist/404.html");
console.log("Copied dist/index.html -> dist/404.html");
