"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Home, RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-6 py-16 text-center">
      {/* subtle brand glow + blueprint grid */}
      <div className="bg-aurora pointer-events-none absolute inset-0 -z-10" />
      <div className="bg-grid pointer-events-none absolute inset-0 -z-10 opacity-[0.35] [mask-image:radial-gradient(60rem_40rem_at_50%_30%,black,transparent)]" />

      <div className="animate-in-up flex w-full max-w-xl flex-col items-center">
        <Logo className="mb-12" />

        <span className="mb-6 grid h-14 w-14 place-items-center rounded-2xl border border-border bg-card text-destructive shadow-soft">
          <TriangleAlert className="h-6 w-6" />
        </span>

        <h1 className="text-gradient font-display text-4xl font-extrabold tracking-tight sm:text-5xl">
          Something went sideways
        </h1>
        <p className="mt-4 max-w-md text-balance text-muted-foreground">
          An unexpected error interrupted this drawing. You can try again, or head back home
          while we square the corners.
        </p>

        {error.digest ? (
          <p className="mt-5 inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 font-mono text-xs text-muted-foreground glass">
            <span className="text-muted-foreground/70">digest</span>
            <span className="text-foreground">{error.digest}</span>
          </p>
        ) : null}

        <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row">
          <Button onClick={() => reset()} variant="brand" size="lg">
            <RefreshCw />
            Try again
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/">
              <Home />
              Back home
            </Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
