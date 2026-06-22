import type { Metadata, Viewport } from "next";
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

const DESCRIPTION =
  "Generate Vastu-compliant, building-code-aware Indian home designs — five ranked schemes with 2D CAD drawings, a live 3D walkthrough, MEP coordination, BOQ cost estimates, and client-ready exports.";

export const metadata: Metadata = {
  metadataBase: new URL("https://gharplan.app"),
  title: {
    default: "GharPlan — AI Architect OS for Indian Homes",
    template: "%s · GharPlan",
  },
  description: DESCRIPTION,
  applicationName: "GharPlan",
  keywords: [
    "Vastu house plan",
    "Indian home design",
    "floor plan generator",
    "AI architect",
    "NBC building code",
    "BOQ estimate",
    "2D CAD floor plan",
    "3D house design",
    "MEP coordination",
    "Karnataka Telangana Andhra Pradesh",
  ],
  authors: [{ name: "GharPlan" }],
  creator: "GharPlan",
  publisher: "GharPlan",
  category: "technology",
  openGraph: {
    type: "website",
    locale: "en_IN",
    url: "https://gharplan.app",
    siteName: "GharPlan",
    title: "GharPlan — AI Architect OS for Indian Homes",
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: "GharPlan — AI Architect OS for Indian Homes",
    description: DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0b14" },
  ],
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "GharPlan",
  applicationCategory: "DesignApplication",
  operatingSystem: "Web",
  url: "https://gharplan.app",
  description: DESCRIPTION,
  featureList: [
    "Vastu-compliant automatic floor-plan layout",
    "National Building Code (NBC) setback / FAR / coverage checks",
    "2D CAD drawing set with elevations and section",
    "Real-time 3D walkthrough",
    "MEP coordination diagrams",
    "Bill of Quantities and cost estimate",
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${sora.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
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
