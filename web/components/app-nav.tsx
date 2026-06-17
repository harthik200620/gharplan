"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CreditCard,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Sparkles,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/studio", label: "AI Studio", icon: Sparkles },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/billing", label: "Billing", icon: CreditCard },
];

export function AppNav({
  studioName,
  credits,
  subscribed,
}: {
  studioName: string;
  credits: number;
  subscribed: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const creditBadge = subscribed ? (
    <Badge variant="pass">Unlimited</Badge>
  ) : (
    <Badge variant={credits > 0 ? "brand" : "warn"}>{credits} credits</Badge>
  );

  const navLinks = (
    <nav className="flex flex-col gap-1">
      {LINKS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            onClick={() => setOpen(false)}
            className={cn(
              "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-accent/15 text-sidebar-foreground ring-1 ring-inset ring-sidebar-accent/25"
                : "text-sidebar-muted hover:bg-white/5 hover:text-sidebar-foreground",
            )}
          >
            <Icon
              className={cn(
                "h-4 w-4 shrink-0 transition-colors",
                active ? "text-sidebar-accent" : "text-sidebar-muted group-hover:text-sidebar-foreground",
              )}
            />
            {label}
          </Link>
        );
      })}
    </nav>
  );

  const footer = (
    <div className="space-y-3 border-t border-sidebar-border pt-4">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium text-sidebar-foreground">{studioName}</span>
        <Link href="/billing" onClick={() => setOpen(false)}>
          {creditBadge}
        </Link>
      </div>
      <button
        onClick={signOut}
        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-muted transition-colors hover:bg-white/5 hover:text-sidebar-foreground"
      >
        <LogOut className="h-4 w-4" /> Sign out
      </button>
    </div>
  );

  return (
    <>
      {/* desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar px-4 py-5 text-sidebar-foreground lg:flex">
        <div className="px-1">
          {/* override Logo's foreground wordmark color for the dark sidebar */}
          <Logo href="/dashboard" className="[&_span:last-child]:text-sidebar-foreground" />
        </div>
        <div className="mt-7 flex-1 overflow-y-auto">{navLinks}</div>
        {footer}
      </aside>

      {/* mobile top bar */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-sidebar-border bg-sidebar px-4 text-sidebar-foreground lg:hidden">
        <Logo href="/dashboard" className="[&_span:last-child]:text-sidebar-foreground" />
        <div className="flex items-center gap-2">
          <Link href="/billing">{creditBadge}</Link>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setOpen((v) => !v)}
            className="text-sidebar-foreground hover:bg-white/10 hover:text-sidebar-foreground"
            aria-label="Toggle menu"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </header>

      {/* mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-sidebar/60 backdrop-blur-sm" />
          <div
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col border-r border-sidebar-border bg-sidebar px-4 py-5 text-sidebar-foreground animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-1">
              <Logo href="/dashboard" className="[&_span:last-child]:text-sidebar-foreground" />
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setOpen(false)}
                className="text-sidebar-foreground hover:bg-white/10 hover:text-sidebar-foreground"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="mt-7 flex-1 overflow-y-auto">{navLinks}</div>
            {footer}
          </div>
        </div>
      )}
    </>
  );
}
