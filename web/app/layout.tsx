import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "GharPlan — Vastu & code-aware Design-to-Cost copilot",
  description:
    "Check a plan against Vastu and building code, auto-generate a GST'd BOQ from room geometry, and export a client proposal + DXF.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        {children}
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
