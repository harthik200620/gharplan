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
      <CardHeader>
        <CardTitle>Studio branding</CardTitle>
        <p className="text-sm text-muted-foreground">Shown on the client proposal (PDF) and BOQ exports.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          {f.logo_data_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={f.logo_data_url} alt="logo" className="h-16 w-16 rounded border object-contain" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded border text-xs text-muted-foreground">No logo</div>
          )}
          <div>
            <Label htmlFor="logo">Logo (PNG/JPG, &lt;300 KB)</Label>
            <Input id="logo" type="file" accept="image/*" onChange={onLogo} className="mt-1" />
          </div>
        </div>

        <Field label="Studio name">
          <Input value={f.studio_name} onChange={(e) => up({ studio_name: e.target.value })} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="GSTIN">
            <Input value={f.gstin} onChange={(e) => up({ gstin: e.target.value })} />
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
            className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={f.terms}
            onChange={(e) => up({ terms: e.target.value })}
          />
        </Field>

        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save branding"}
        </Button>
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
