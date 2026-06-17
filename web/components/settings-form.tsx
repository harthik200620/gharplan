"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Profile } from "@/lib/db";
import { createClient } from "@/lib/supabase/client";

export function SettingsForm({ profile }: { profile: Profile }) {
  const supabase = createClient();
  const [f, setF] = useState(profile);
  const [saving, setSaving] = useState(false);
  const up = (patch: Partial<Profile>) => setF((s) => ({ ...s, ...patch }));

  function onLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 300_000) return toast.error("Logo too large — keep it under 300 KB.");
    const reader = new FileReader();
    reader.onload = () => up({ logo_data_url: reader.result as string });
    reader.readAsDataURL(file);
  }

  async function save() {
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        studio_name: f.studio_name,
        address: f.address,
        gstin: f.gstin,
        phone: f.phone,
        email: f.email,
        website: f.website,
        logo_data_url: f.logo_data_url,
        terms: f.terms,
      })
      .eq("id", profile.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Branding saved — it will appear on your proposals.");
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader className="border-b">
        <CardTitle>Studio branding</CardTitle>
        <p className="text-sm text-muted-foreground">Shown on the client proposal (PDF) and BOQ exports.</p>
      </CardHeader>
      <CardContent className="space-y-5 pt-6">
        <div className="flex items-center gap-4">
          {f.logo_data_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={f.logo_data_url}
              alt="logo"
              className="h-16 w-16 rounded-xl border bg-card object-contain p-1 shadow-soft"
            />
          ) : (
            <div className="grid h-16 w-16 place-items-center rounded-xl border border-dashed bg-muted/40 text-[11px] text-muted-foreground">
              No logo
            </div>
          )}
          <div className="flex-1">
            <Label htmlFor="logo">Logo (PNG/JPG, &lt;300 KB)</Label>
            <Input
              id="logo"
              type="file"
              accept="image/*"
              onChange={onLogo}
              className="mt-1.5 cursor-pointer file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1 file:text-sm file:font-medium file:text-secondary-foreground hover:file:bg-secondary/70"
            />
          </div>
        </div>

        <Field label="Studio name">
          <Input value={f.studio_name} onChange={(e) => up({ studio_name: e.target.value })} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="GSTIN">
            <Input value={f.gstin} onChange={(e) => up({ gstin: e.target.value })} className="font-mono" />
          </Field>
          <Field label="Phone">
            <Input value={f.phone} onChange={(e) => up({ phone: e.target.value })} />
          </Field>
          <Field label="Email">
            <Input value={f.email} onChange={(e) => up({ email: e.target.value })} />
          </Field>
          <Field label="Website">
            <Input value={f.website} onChange={(e) => up({ website: e.target.value })} />
          </Field>
        </div>
        <Field label="Address">
          <Input value={f.address} onChange={(e) => up({ address: e.target.value })} />
        </Field>
        <Field label="Terms & Conditions (proposal footer)">
          <textarea
            className="min-h-24 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={f.terms}
            onChange={(e) => up({ terms: e.target.value })}
          />
        </Field>

        <div className="flex justify-end border-t pt-5">
          <Button variant="brand" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save branding"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
