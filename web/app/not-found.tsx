import Link from "next/link";
import { Compass, Home, PenTool } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";

export default function NotFound() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-6 py-16 text-center">
      {/* subtle brand glow + blueprint grid */}
      <div className="bg-aurora pointer-events-none absolute inset-0 -z-10" />
      <div className="bg-grid pointer-events-none absolute inset-0 -z-10 opacity-[0.35] [mask-image:radial-gradient(60rem_40rem_at_50%_30%,black,transparent)]" />

      <div className="animate-in-up flex w-full max-w-xl flex-col items-center">
        <Logo className="mb-12" />

        <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs font-medium text-muted-foreground glass">
          <PenTool className="h-3.5 w-3.5 text-primary" />
          Error 404 — page not found
        </p>

        <h1 className="text-gradient font-display text-7xl font-extrabold leading-none tracking-tight sm:text-8xl">
          404
        </h1>

        <h2 className="mt-6 font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          This blueprint doesn&apos;t exist
        </h2>
        <p className="mt-3 max-w-md text-balance text-muted-foreground">
          The page you&apos;re looking for was never drawn — or has moved.
        </p>

        <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row">
          <Button asChild variant="brand" size="lg">
            <Link href="/">
              <Home />
              Back home
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/studio">
              <Compass />
              Open Studio
            </Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
