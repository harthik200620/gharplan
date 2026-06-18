import { NextResponse } from "next/server";

// Claude-powered natural-language brief parser. Turns a one-line description
// ("3BHK east-facing in Bengaluru, pooja room, ~25 lakhs") into the structured
// fields the deterministic generator consumes. Gracefully 503s when no key is
// configured, so the Studio falls back to the form.

const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

const TOOL = {
  name: "set_brief",
  description: "Extract a structured Indian residential design brief from the user's description.",
  input_schema: {
    type: "object",
    properties: {
      bhk: { type: "integer", minimum: 1, maximum: 4, description: "number of bedrooms" },
      widthFt: { type: "number", description: "plot width in feet" },
      depthFt: { type: "number", description: "plot depth in feet" },
      facing: { type: "string", enum: ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] },
      city: { type: "string", enum: ["Bengaluru", "Hyderabad", "Tirupati", "Pune"] },
      floors: { type: "integer", minimum: 1, maximum: 3 },
      budgetTier: { type: "string", enum: ["economy", "standard", "premium"] },
      vastuPriority: { type: "boolean" },
      projectName: { type: "string" },
      clientName: { type: "string" },
      notes: { type: "string", description: "special rooms or wishes, e.g. home office, pooja, parking" },
      family_persona: { type: "string", description: "deep family persona or lifestyle descriptions, e.g. 'We have two kids and a golden retriever. Add a dog wash.'" },
    },
    required: [],
  },
};

const SYSTEM =
  "You convert a one-line Indian residential home brief into structured fields by calling set_brief. " +
  "Plots are in feet (common sizes 30x40, 40x60, 20x30). Map city aliases (Bangalore→Bengaluru, Hyd→Hyderabad). " +
  "Infer budgetTier from cues ('premium', 'budget'→economy, a rupee figure→standard unless clearly luxury). " +
  "Default vastuPriority true unless the user explicitly doesn't want Vastu. Put special-room requests in notes. " +
  "Put family or lifestyle descriptions in family_persona. " +
  "Only set fields you can confidently infer; omit the rest.";

export async function POST(req: Request) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return NextResponse.json({ error: "ai_not_configured" }, { status: 503 });

  let text: string;
  try {
    ({ text } = await req.json());
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (!text || typeof text !== "string" || text.trim().length < 3) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 512,
        system: SYSTEM,
        tools: [TOOL],
        tool_choice: { type: "tool", name: "set_brief" },
        messages: [{ role: "user", content: text.slice(0, 800) }],
      }),
    });
  } catch (e) {
    return NextResponse.json({ error: "ai_unreachable" }, { status: 502 });
  }

  if (!res.ok) {
    return NextResponse.json({ error: "ai_failed", detail: await res.text() }, { status: 502 });
  }

  const data = await res.json();
  const toolUse = (data.content ?? []).find((c: { type: string }) => c.type === "tool_use");
  if (!toolUse?.input) return NextResponse.json({ error: "no_brief" }, { status: 502 });

  return NextResponse.json({ brief: toolUse.input });
}
