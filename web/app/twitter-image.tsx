// `runtime` must be a direct export here — Next doesn't pick up a re-exported
// route segment config. (Edge avoids the Windows @vercel/og font-path bug.)
export const runtime = "edge";
export { default, alt, size, contentType } from "./opengraph-image";
