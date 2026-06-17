import type { Metadata } from "next";
import { Inter, Sora, JetBrains_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const sora = Sora({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-sora",
  display: "swap",
});
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "GharPlan - Architect OS for Indian Homes",
  description:
    "Generate five Indian residential design directions with Vastu, code, CAD, 3D, MEP coordination prompts, BOQ, and client-ready exports.",
  metadataBase: new URL("https://gharplan.app"),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${sora.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-background font-sans antialiased">
        {children}
        <Toaster
          richColors
          position="top-center"
          toastOptions={{ style: { borderRadius: "0.75rem" } }}
        />
      </body>
    </html>
  );
}
