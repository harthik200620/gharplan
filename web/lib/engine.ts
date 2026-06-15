// Typed client for the GharPlan compute engine (FastAPI).

import type {
  BoqReport,
  BoqRequest,
  CodeReport,
  GenerateResponse,
  Plan,
  ValidateResponse,
  VastuReport,
} from "@gharplan/shared";

const ENGINE_URL = process.env.NEXT_PUBLIC_ENGINE_URL || "http://localhost:8000";

export class EngineError extends Error {
  constructor(
    public status: number,
    public detail: unknown,
  ) {
    super(typeof detail === "string" ? detail : `Engine error ${status}`);
  }
}

async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${ENGINE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    let detail: unknown = res.statusText;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {
      /* keep statusText */
    }
    throw new EngineError(res.status, detail);
  }
  return res.json() as Promise<T>;
}

export const engine = {
  validate: (plan: Plan, signal?: AbortSignal) => post<ValidateResponse>("/plan/validate", plan, signal),
  vastu: (plan: Plan, signal?: AbortSignal) => post<VastuReport>("/vastu/check", plan, signal),
  code: (plan: Plan, signal?: AbortSignal) => post<CodeReport>("/code/check", plan, signal),
  boq: (req: BoqRequest, signal?: AbortSignal) => post<BoqReport>("/boq/generate", req, signal),
  generate: (plot: Plan["plot"], brief?: string) => post<GenerateResponse>("/plan/generate", { plot, brief }),
  engineUrl: ENGINE_URL,
};
