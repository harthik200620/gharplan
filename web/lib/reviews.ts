// Professional sign-off workflow — review state, hashing, persistence, package text.
//
// DESIGN NOTE — deviation from a server-side reviewer-invite flow: the app is
// demo-mode-first (no Supabase env → no auth, no server persistence), so the
// workflow is client-first. Review state lives in localStorage keyed by the
// plan-version hash; when Supabase IS configured it is additionally mirrored
// to a `reviews` table (supabase/migrations/20260707_reviews.sql) on a
// best-effort basis — errors are swallowed because the table may not exist
// until the migration runs. A full reviewer-invite flow (server-issued review
// links, reviewer accounts, audit trail) requires auth and is deliberately
// out of scope.
//
// LEGAL FRAMING (non-negotiable): the platform NEVER claims approval. This
// module records that a licensed professional REVIEWED the design and takes
// professional responsibility — copy says "professionally reviewed" /
// "sign-off", never "approved" or "sanctioned". Un-reviewed packages are
// marked "PRELIMINARY — NOT REVIEWED".

import { DISCLAIMERS } from "@gharplan/shared";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/client";

export const REG_TYPES = ["COA architect", "Licensed engineer", "Structural engineer"] as const;
export type RegType = (typeof REG_TYPES)[number];

export type ReviewState = {
  planHash: string;
  reviewerName: string;
  regNo: string;
  regType: RegType;
  stampDataUrl: string | null;
  checklist: Record<string, boolean>;
  lockedAt: string | null;
};

/** What the licensed professional attests to before signing off. */
export const REVIEW_CHECKLIST: { key: string; label: string }[] = [
  { key: "plot_dimensions", label: "Plot dimensions verified against the survey / sale deed" },
  { key: "setbacks", label: "Setbacks confirmed against the local GO / bylaw table" },
  { key: "far_coverage", label: "FAR and ground coverage independently recomputed" },
  { key: "structural", label: "Preliminary structural design independently verified" },
  { key: "mep", label: "MEP layouts (electrical, plumbing, HVAC) reviewed" },
  { key: "vastu_advisory", label: "Vastu guidance acknowledged as advisory, non-statutory" },
  { key: "rates_indicative", label: "Rates / BOQ marked indicative, not a quotation" },
  { key: "submission_format", label: "Drawings fit the municipal submission format" },
];

export function emptyReview(hash: string): ReviewState {
  return {
    planHash: hash,
    reviewerName: "",
    regNo: "",
    regType: "COA architect",
    stampDataUrl: null,
    checklist: Object.fromEntries(REVIEW_CHECKLIST.map((i) => [i.key, false])),
    lockedAt: null,
  };
}

/**
 * SHA-256 hex of the plan's canonical JSON. Canonicalisation is
 * JSON.stringify of the plan object as-received: the plan travels as a single
 * JSON document from the engine and is never re-keyed client-side, so key
 * order is stable for our purposes. Any geometry/content change (including a
 * refine) yields a new hash — i.e. a new version to review.
 */
export async function planHash(plan: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(plan));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const storageKey = (hash: string) => `vastukala:review:${hash}`;

export function loadReview(hash: string): ReviewState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(hash));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ReviewState>;
    return { ...emptyReview(hash), ...parsed, planHash: hash };
  } catch {
    return null;
  }
}

/** Persist locally (demo mode); mirror to Supabase when configured. */
export function saveReview(review: ReviewState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(review.planHash), JSON.stringify(review));
  } catch {
    /* storage full / privacy mode — state stays in memory for the session */
  }
  if (hasSupabaseEnv()) void upsertRemote(review);
}

async function upsertRemote(review: ReviewState): Promise<void> {
  // Best-effort by design: non-fatal if signed out or if the `reviews` table
  // has not been created yet (migration not applied).
  try {
    const supabase = createClient();
    if (!supabase) return;
    const { data } = await supabase.auth.getUser();
    const user = data?.user;
    if (!user) return;
    await supabase.from("reviews").upsert(
      {
        user_id: user.id,
        plan_hash: review.planHash,
        reviewer_name: review.reviewerName,
        reg_no: review.regNo,
        reg_type: review.regType,
        checklist: review.checklist,
        stamp_data_url: review.stampDataUrl,
        locked_at: review.lockedAt,
      },
      { onConflict: "user_id,plan_hash" },
    );
  } catch {
    /* non-fatal by design */
  }
}

export function checklistProgress(review: ReviewState): { done: number; total: number } {
  const total = REVIEW_CHECKLIST.length;
  const done = REVIEW_CHECKLIST.filter((i) => review.checklist[i.key]).length;
  return { done, total };
}

/** Sign-off complete = checklist 100% + version locked + reviewer identified. */
export function isReviewComplete(review: ReviewState): boolean {
  const { done, total } = checklistProgress(review);
  return done === total && !!review.lockedAt && !!review.reviewerName.trim() && !!review.regNo.trim();
}

/** Split a data: URL into mime + base64 payload (for zipping the stamp). */
export function dataUrlBase64(dataUrl: string): { mime: string; base64: string } | null {
  const m = /^data:([^;,]+);base64,(.+)$/.exec(dataUrl);
  return m ? { mime: m[1], base64: m[2] } : null;
}

const RULE = "=".repeat(64);

/** REVIEW.txt — the review record shipped inside every package. */
export function buildReviewTxt(review: ReviewState, opts: { projectName: string; complete: boolean }): string {
  const { done, total } = checklistProgress(review);
  return [
    RULE,
    opts.complete ? "PROFESSIONALLY REVIEWED" : "PRELIMINARY — NOT REVIEWED",
    RULE,
    "",
    `Project           : ${opts.projectName}`,
    `Plan version hash : sha256:${review.planHash}`,
    `Version locked at : ${review.lockedAt ?? "(version not locked)"}`,
    `Record generated  : ${new Date().toISOString()}`,
    "",
    `Reviewer          : ${review.reviewerName.trim() || "(not provided)"}`,
    `Registration no.  : ${review.regNo.trim() || "(not provided)"}`,
    `Registration type : ${review.regType}`,
    `Stamp / signature : ${review.stampDataUrl ? "INCLUDED (stamp.png)" : "NOT INCLUDED"}`,
    "",
    `Review checklist (${done}/${total}):`,
    ...REVIEW_CHECKLIST.map((i) => `  [${review.checklist[i.key] ? "x" : " "}] ${i.label}`),
    "",
    "This record documents a professional review workflow. It is not a",
    "statutory approval or municipal sanction. See DISCLAIMER.txt.",
    "",
  ].join("\n");
}

/** DISCLAIMER.txt — the standing disclaimer, shipped inside every package. */
export function buildDisclaimerTxt(): string {
  return [
    "DISCLAIMER",
    "",
    DISCLAIMERS.export,
    "",
    "This package was prepared by Vastukala AI as preliminary design",
    "intelligence. Statutory submission requires review and sign-off by the",
    "licensed professional named above, who assumes professional",
    "responsibility.",
    "",
    "Vastukala AI does not approve, sanction, or certify building plans.",
    "The review record in REVIEW.txt documents a licensed professional's own",
    "verification — it is not an approval by the platform or any authority.",
    "",
  ].join("\n");
}
