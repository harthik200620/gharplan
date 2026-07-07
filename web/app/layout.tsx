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
  "Vastukala AI — the autonomous architect platform for India. Vastu-compliant, building-code-aware home designs with 2D CAD drawings, live 3D, structural + MEP intelligence, BOQ estimates, and sign-off-ready exports.";

export const metadata: Metadata = {
  metadataBase: new URL("https://vastukala.ai"),
  title: {
    default: "Vastukala AI — The Autonomous Architect Platform for India",
    template: "%s · Vastukala AI",
  },
  description: DESCRIPTION,
  applicationName: "Vastukala AI",
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
  authors: [{ name: "Vastukala AI" }],
  creator: "Vastukala AI",
  publisher: "Vastukala AI",
  category: "technology",
  openGraph: {
    type: "website",
    locale: "en_IN",
    url: "https://vastukala.ai",
    siteName: "Vastukala AI",
    title: "Vastukala AI — The Autonomous Architect Platform for India",
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: "Vastukala AI — The Autonomous Architect Platform for India",
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
  name: "Vastukala AI",
  applicationCategory: "DesignApplication",
  operatingSystem: "Web",
  url: "https://vastukala.ai",
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
