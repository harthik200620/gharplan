"use client";

// Professional sign-off tab — a licensed professional (COA-registered
// architect / licensed engineer) reviews a locked plan version, works a
// checklist, and downloads a submission package they take responsibility
// for. The platform itself never approves or sanctions anything: incomplete
// reviews download as "<project>_PRELIMINARY.zip" with a
// "PRELIMINARY — NOT REVIEWED" review record. See web/lib/reviews.ts for the
// demo-mode-first design note.

import * as React from "react";
import { Check, Copy, Download, Loader2, Lock, LockOpen, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Plan } from "@gharplan/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  REG_TYPES,
  REVIEW_CHECKLIST,
  type RegType,
  type ReviewState,
  buildDisclaimerTxt,
  buildReviewTxt,
  checklistProgress,
  dataUrlBase64,
  emptyReview,
  isReviewComplete,
  loadReview,
  planHash,
  saveReview,
} from "@/lib/reviews";

const MAX_STAMP_BYTES = 500 * 1024;

export function SignoffPanel({
  plan,
  finishTier,
}: {
  plan: Plan;
  finishTier?: "economy" | "standard" | "premium";
}) {
  const [hash, setHash] = React.useState<string | null>(null);
  const [review, setReview] = React.useState<ReviewState | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [zipping, setZipping] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  // Any plan change (including a refine) is a new version: new hash, own review state.
  React.useEffect(() => {
    let alive = true;
    setHash(null);
    setReview(null);
    planHash(plan).then((h) => {
      if (!alive) return;
      setHash(h);
      setReview(loadReview(h) ?? emptyReview(h));
    });
    return () => {
      alive = false;
    };
  }, [plan]);

  // Persist outside the setState updater (StrictMode-safe: updaters must be pure).
  React.useEffect(() => {
    if (review) saveReview(review);
  }, [review]);

  function update(patch: Partial<ReviewState>) {
    setReview((r) => (r ? { ...r, ...patch } : r));
  }

  if (!hash || !review) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Fingerprinting this plan version…
      </div>
    );
  }

  const locked = !!review.lockedAt;
  const { done, total } = checklistProgress(review);
  const complete = isReviewComplete(review);

  async function copyHash() {
    if (!hash) return;
    try {
      await navigator.clipboard.writeText(hash);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast.success("Plan hash copied.");
    } catch {
      toast.error("Could not copy — select the hash manually.");
    }
  }

  function onStampFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      toast.error("Stamp must be a PNG or JPG image.");
      return;
    }
    if (file.size > MAX_STAMP_BYTES) {
      toast.error("Stamp image must be 500 KB or smaller.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => update({ stampDataUrl: String(reader.result) });
    reader.onerror = () => toast.error("Could not read the stamp image.");
    reader.readAsDataURL(file);
  }

  async function downloadZip() {
    if (!review) return;
    setZipping(true);
    try {
      const base = plan.project.name.replace(/\W+/g, "_");
      // Same request shape as the studio's single-file export buttons; the
      // /api/export/[type] route unwraps `plan` itself for dxf/ifc.
      const body = JSON.stringify({ plan, finishTier });
      const fetchExport = async (type: "pdf" | "dxf" | "ifc") => {
        const res = await fetch(`/api/export/${type}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });
        if (!res.ok) throw new Error(`${type.toUpperCase()} export failed (${res.status})`);
        return res.arrayBuffer();
      };
      const [pdf, dxf, ifc] = await Promise.all([
        fetchExport("pdf"),
        fetchExport("dxf"),
        fetchExport("ifc"),
      ]);

      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      zip.file("plan.pdf", pdf);
      zip.file("plan.dxf", dxf);
      zip.file("plan.ifc", ifc);
      zip.file("REVIEW.txt", buildReviewTxt(review, { projectName: plan.project.name, complete }));
      zip.file("DISCLAIMER.txt", buildDisclaimerTxt());
      if (review.stampDataUrl) {
        const stamp = dataUrlBase64(review.stampDataUrl);
        if (stamp) zip.file("stamp.png", stamp.base64, { base64: true });
        // TODO(engine): stamp the reviewer's seal onto the PDF title block in
        // build_pdf — the branding pipeline already accepts a logo, but wiring
        // reviewer stamps through it is out of scope for this client-side
        // workflow; the raw stamp ships in the ZIP instead.
      }

      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = complete ? `${base}_sanction_package.zip` : `${base}_PRELIMINARY.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(
        complete
          ? "Sign-off package downloaded."
          : "Preliminary package downloaded — marked NOT REVIEWED.",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Package download failed.");
    } finally {
      setZipping(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* legal framing */}
      <div className="flex items-start gap-2.5 rounded-xl border bg-muted/30 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <span>
          Vastukala AI produces preliminary design intelligence — it never approves or sanctions a
          plan. This workflow lets a licensed professional (COA-registered architect or licensed
          engineer) review this exact version and take professional responsibility for submission.
        </span>
      </div>

      {/* (a) version */}
      <section className="rounded-xl border bg-card p-4 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Version</div>
            <div className="mt-1 flex items-center gap-2">
              <code className="rounded bg-muted px-2 py-1 font-mono text-xs" title={`sha256:${hash}`}>
                sha256:{hash.slice(0, 16)}…
              </code>
              <Button variant="outline" size="sm" onClick={copyHash}>
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                Copy
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {locked ? (
              <Badge variant="brand">Locked {new Date(review.lockedAt!).toLocaleDateString("en-IN")}</Badge>
            ) : (
              <Badge variant="outline">Not locked</Badge>
            )}
            <Button
              variant={locked ? "outline" : "accent"}
              size="sm"
              onClick={() => update({ lockedAt: locked ? null : new Date().toISOString() })}
            >
              {locked ? <LockOpen className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
              {locked ? "Unlock" : "Lock this version"}
            </Button>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          The hash fingerprints this exact geometry — any refine produces a new version with its own
          review. Locking freezes the checklist below; sign-off applies only to the locked version.
        </p>
      </section>

      {/* (b) reviewer */}
      <section className="rounded-xl border bg-card p-4 shadow-soft">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Reviewer</div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="signoff-name">Full name</Label>
            <Input
              id="signoff-name"
              value={review.reviewerName}
              onChange={(e) => update({ reviewerName: e.target.value })}
              placeholder="Ar. Priya Sharma"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="signoff-regno">Registration number</Label>
            <Input
              id="signoff-regno"
              value={review.regNo}
              onChange={(e) => update({ regNo: e.target.value })}
              placeholder="CA/2015/12345"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="signoff-regtype">Registration type</Label>
            <select
              id="signoff-regtype"
              value={review.regType}
              onChange={(e) => update({ regType: e.target.value as RegType })}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {REG_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="signoff-stamp">Stamp / signature image (PNG or JPG, ≤ 500 KB)</Label>
            <div className="flex items-center gap-2">
              <input
                ref={fileRef}
                id="signoff-stamp"
                type="file"
                accept="image/png,image/jpeg"
                onChange={onStampFile}
                className="hidden"
              />
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                Upload image
              </Button>
              {review.stampDataUrl && (
                <Button variant="outline" size="sm" onClick={() => update({ stampDataUrl: null })}>
                  <Trash2 className="h-3.5 w-3.5" /> Remove
                </Button>
              )}
            </div>
          </div>
          {review.stampDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={review.stampDataUrl}
              alt="Reviewer stamp preview"
              className="h-[120px] w-auto rounded-lg border bg-white object-contain p-1"
            />
          )}
        </div>
      </section>

      {/* (c) checklist */}
      <section className="rounded-xl border bg-card p-4 shadow-soft">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Review checklist
          </div>
          <span
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-semibold",
              done === total
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300"
                : "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300",
            )}
          >
            {done}/{total}
          </span>
        </div>
        {locked && (
          <p className="mt-1 text-[11px] text-muted-foreground">
            Version locked — unlock to edit the checklist.
          </p>
        )}
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {REVIEW_CHECKLIST.map((item) => (
            <label
              key={item.key}
              className={cn(
                "flex items-start gap-2.5 rounded-lg border bg-background/50 p-2.5 text-sm transition-colors",
                locked ? "cursor-not-allowed opacity-70" : "cursor-pointer hover:bg-muted/40",
              )}
            >
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-primary"
                checked={!!review.checklist[item.key]}
                disabled={locked}
                onChange={() =>
                  update({ checklist: { ...review.checklist, [item.key]: !review.checklist[item.key] } })
                }
              />
              <span className="leading-snug">{item.label}</span>
            </label>
          ))}
        </div>
      </section>

      {/* (d) package */}
      <section className="rounded-xl border bg-card p-4 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Sanction-ready package
            </div>
            <div className="mt-1 flex items-center gap-2">
              {complete ? (
                <Badge variant="brand">Professionally reviewed</Badge>
              ) : (
                <Badge variant="outline">PRELIMINARY — NOT REVIEWED</Badge>
              )}
            </div>
          </div>
          <Button variant="accent" size="sm" disabled={zipping} onClick={downloadZip}>
            {zipping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Download ZIP
          </Button>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Contains plan.pdf, plan.dxf, plan.ifc, REVIEW.txt, DISCLAIMER.txt
          {review.stampDataUrl ? ", stamp.png" : ""}. Named{" "}
          <code className="font-mono">…_sanction_package.zip</code> once the checklist is complete,
          the version is locked and the reviewer is identified; until then it downloads as{" "}
          <code className="font-mono">…_PRELIMINARY.zip</code> with the review record headed
          “PRELIMINARY — NOT REVIEWED”.
        </p>
      </section>
    </div>
  );
}
