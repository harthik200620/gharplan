import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    container: { center: true, padding: "1.25rem", screens: { "2xl": "1280px" } },
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-sora)", "var(--font-inter)", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          emphasis: "hsl(var(--primary-emphasis))",
        },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        success: { DEFAULT: "hsl(var(--success))", foreground: "hsl(var(--success-foreground))" },
        warning: { DEFAULT: "hsl(var(--warning))", foreground: "hsl(var(--warning-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
        popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar))",
          foreground: "hsl(var(--sidebar-foreground))",
          muted: "hsl(var(--sidebar-muted))",
          accent: "hsl(var(--sidebar-accent))",
          border: "hsl(var(--sidebar-border))",
        },
        zone: {
          n: "hsl(var(--zone-n))",
          ne: "hsl(var(--zone-ne))",
          e: "hsl(var(--zone-e))",
          se: "hsl(var(--zone-se))",
          s: "hsl(var(--zone-s))",
          sw: "hsl(var(--zone-sw))",
          w: "hsl(var(--zone-w))",
          nw: "hsl(var(--zone-nw))",
          c: "hsl(var(--zone-c))",
        },
        // legacy aliases (kept so older components don't break)
        ok: "hsl(var(--success))",
        warn: "hsl(var(--warning))",
        bad: "hsl(var(--destructive))",
      },
      borderRadius: {
        "2xl": "calc(var(--radius) + 6px)",
        xl: "calc(var(--radius) + 2px)",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 4px)",
        sm: "calc(var(--radius) - 6px)",
      },
      boxShadow: {
        soft: "0 1px 2px -1px hsl(244 40% 20% / 0.10), 0 4px 12px -6px hsl(244 40% 20% / 0.12)",
        premium:
          "0 1px 0 0 hsl(0 0% 100% / 0.5) inset, 0 2px 4px -2px hsl(244 40% 20% / 0.12), 0 12px 32px -14px hsl(244 40% 20% / 0.22)",
        glow: "0 0 0 1px hsl(var(--primary) / 0.4), 0 8px 30px -8px hsl(var(--primary) / 0.45)",
        "glow-accent": "0 8px 30px -8px hsl(var(--accent) / 0.5)",
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(280 70% 60%) 55%, hsl(var(--primary-emphasis)) 100%)",
        "brand-sheen": "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(264 78% 62%) 100%)",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "fade-up": { from: { opacity: "0", transform: "translateY(12px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        "scale-in": { from: { opacity: "0", transform: "scale(0.96)" }, to: { opacity: "1", transform: "scale(1)" } },
        shimmer: { "100%": { transform: "translateX(100%)" } },
        float: { "0%,100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-6px)" } },
        "gradient-pan": { "0%,100%": { backgroundPosition: "0% 50%" }, "50%": { backgroundPosition: "100% 50%" } },
        "pulse-ring": {
          "0%": { boxShadow: "0 0 0 0 hsl(var(--primary) / 0.5)" },
          "70%": { boxShadow: "0 0 0 10px hsl(var(--primary) / 0)" },
          "100%": { boxShadow: "0 0 0 0 hsl(var(--primary) / 0)" },
        },
        // radix data-state transitions
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
      },
      animation: {
        "fade-in": "fade-in 0.5s cubic-bezier(0.22,1,0.36,1) both",
        "fade-up": "fade-up 0.6s cubic-bezier(0.22,1,0.36,1) both",
        "scale-in": "scale-in 0.25s cubic-bezier(0.22,1,0.36,1) both",
        shimmer: "shimmer 1.8s infinite",
        float: "float 5s ease-in-out infinite",
        "gradient-pan": "gradient-pan 8s ease infinite",
        "pulse-ring": "pulse-ring 2s cubic-bezier(0.4,0,0.6,1) infinite",
      },
    },
  },
  plugins: [],
};

export default config;
