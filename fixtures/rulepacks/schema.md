# Rule-pack schema — `fixtures/rulepacks/`

Machine-readable building-rule packs for Indian jurisdictions, consumed by the rules
resolver (separate code ticket). One JSON file per jurisdiction pack, plus `cases/`
holding table-driven test datasets that are evaluated literally against the packs.

> ADVISORY DATA. These packs encode researched DEFAULT values for early design. They are
> NOT legal advice and NOT a substitute for a sanctioned plan. Every numeric rule band
> carries a `source` with a confidence flag; nearly everything is `needs_verification`
> by design — a wrong legal citation is worse than a flagged one.

## Files

| File | Pack |
|---|---|
| `tg-ghmc.json` | GHMC / HMDA core urban Hyderabad (Telangana) |
| `tg-ulb-common.json` | Other Telangana ULBs (Warangal, Nizamabad, Karimnagar, ...) |
| `ap-dpms-common.json` | AP municipalities via AP DPMS — root AP pack |
| `ap-crda.json` | APCRDA (Amaravati capital region) — `inherits: ap-dpms-common` |
| `ap-tuda.json` | TUDA (Tirupati) — `inherits: ap-dpms-common` |
| `ap-vmrda.json` | VMRDA (Visakhapatnam) — `inherits: ap-dpms-common` |
| `ka-legacy.json` | Karnataka adapter restating `fixtures/code_rules.json` KA block |
| `cases/residential-cases.json` | Table-driven expected outputs, evaluated against the packs |

## Pack shape

```json
{
  "packId": "tg-ghmc",
  "version": "2.0.0",
  "state": "TG",
  "jurisdiction": "GHMC (Greater Hyderabad Municipal Corporation)",
  "regime": "Telangana Building Rules — G.O.Ms.No.168 MA&UD (2012) as amended; TG-bPASS processing",
  "useClass": "residential",
  "inherits": "ap-dpms-common",
  "instantApproval": {
    "maxPlotSqYd": 75,
    "maxPlotSqm": 62.71,
    "maxHeightM": 7,
    "note": "...",
    "source": { "ref": "...", "confidence": "needs_verification" }
  },
  "setbacks": [
    {
      "when": { "plotAreaSqm": [0, 100], "roadWidthM": [0, 100000], "heightM": [0, 100000] },
      "frontM": 1.5, "rearM": 1.0, "sideM": 1.0,
      "note": "optional free-form caveat for this band",
      "source": { "ref": "...", "confidence": "needs_verification" }
    }
  ],
  "heightByRoad": [
    { "roadWidthM": [0, 9], "maxHeightM": 10, "note": "optional", "source": { "ref": "...", "confidence": "needs_verification" } }
  ],
  "far": { "value": null, "note": "explains when null", "source": { "ref": "...", "confidence": "needs_verification" } },
  "coverage": { "maxPct": 55, "note": "optional", "source": { "ref": "...", "confidence": "needs_verification" } },
  "parking": { "perDwelling": 1, "note": "...", "source": { "ref": "...", "confidence": "needs_verification" } },
  "rwh": { "mandatoryAbovePlotSqm": 200, "note": "...", "source": { "ref": "...", "confidence": "needs_verification" } },
  "cornerPlot": { "secondFrontSetback": true, "note": "...", "source": { "ref": "...", "confidence": "needs_verification" } },
  "roomMinimums": { "inheritFrom": "state-baseline", "note": "..." },
  "docChecklist": ["Sale deed / link documents", "..."],
  "notes": ["free-form jurisdictional notes"]
}
```

### Field reference

| Field | Type | Meaning |
|---|---|---|
| `packId` | string | Unique id; matches the filename stem. Referenced by `inherits` and by test cases. |
| `version` | string | Informational semver for the pack data. |
| `state` | string | `"TG"`, `"AP"`, `"KA"` — keys into `fixtures/code_rules.json` `states` for room minimums. |
| `jurisdiction` | string | Human-readable authority / territory description. |
| `regime` | string | Governing rule instrument (G.O. / Act / master plan family). |
| `useClass` | string | `"residential"` for all current packs. |
| `inherits` | string (optional) | packId of a parent pack in this directory. See Inheritance. |
| `instantApproval` | object or `null` | Fast-track eligibility envelope. `null` = no instant-approval track modeled (eligibility always false). |
| `setbacks` | array | Banded setback rules. See Band semantics. |
| `heightByRoad` | array | Max building height keyed on abutting road width. Range is inline (`roadWidthM`), not wrapped in `when`. |
| `far` | object | `value` is a number or `null`. `null` means the regime has NO separate FAR cap (envelope is controlled by setbacks + height); the `note` must explain and may name an advisory fallback. |
| `coverage` | object | `maxPct` ground coverage percentage (0-100). |
| `parking` | object | `perDwelling` count for an individual dwelling; larger/group development norms go in `note`. |
| `rwh` | object | `mandatoryAbovePlotSqm`: rainwater harvesting mandatory at/above this plot area; `null` = not modeled. |
| `cornerPlot` | object | `secondFrontSetback` boolean. See Corner plots. |
| `roomMinimums` | object | Delegation marker: room-level minimums (areas, widths, ceiling, ventilation, stair) stay in `fixtures/code_rules.json` `states` block; packs do NOT duplicate them. |
| `docChecklist` | array of strings | Advisory document checklist for a permission application. |
| `notes` | array of strings | Free-form jurisdictional notes, disclaimers, discrepancy log. |

## Source law (non-negotiable)

Every numeric rule band MUST carry:

```json
"source": { "ref": "<GO/rule/clause name>", "confidence": "verified" | "needs_verification" }
```

`"needs_verification"` is the default for everything unless the exact clause is certain.
Expect nearly all bands to be `needs_verification` — that is correct and honest. `ref`
should name the instrument (G.O., rule, table) and/or point at
`docs/region-research.md` where the researched note lives.

## Band semantics

- All range arrays are `[min, max)` — **min-inclusive, max-exclusive** — in the stated
  unit (`plotAreaSqm` in m2, `roadWidthM` in m, `heightM` in m).
- Bands for a dimension must **tile without gaps** from 0; the last band is open-ended
  via a large max (`100000`).
- If a jurisdiction does not vary a rule by a dimension, use ONE full-range band
  `[0, 100000]` for that dimension — granularity that cannot be supported must not be
  invented.
- Setback bands: `when` carries `plotAreaSqm`, `roadWidthM`, `heightM`. A band matches
  when every range present in `when` contains the corresponding input. In the current
  packs only `plotAreaSqm` actually varies; road/height are full-range.
- Optional `note` on any band records caveats and known discrepancies for that band.
- Boundary nuance vs the legacy engine: `fixtures/code_rules.json` uses a
  `maxPlotAreaSqm` ladder that reads as max-INCLUSIVE ("first band whose max >= area"),
  while packs are half-open `[min, max)`. At an exact band edge (e.g. plot exactly
  200 m2 in TG) the pack resolves to the next (larger-plot) band, which is the stricter
  and safer reading. Test cases assert PACK semantics.

## `instantApproval`

- Object or `null`. `null` means no fast track is modeled — resolvers must return
  `instantApprovalEligible: false`.
- `maxPlotSqYd` is the statutory citation unit (TG expresses the threshold in square
  yards). `maxPlotSqm` is the **authoritative resolver value**, precomputed as
  `maxPlotSqYd * 0.83612736` rounded to 2 dp (75 sq yd = 62.71 m2) so resolvers never
  re-derive the conversion.
- Eligibility: `plotAreaSqm <= maxPlotSqm AND heightM <= maxHeightM`.

## Corner plots

`cornerPlot.secondFrontSetback: true` means a corner plot treats the second
road-abutting side as a front setback: the resolver applies the matched setback band's
`frontM` on that flank in place of `sideM`. `false` means no corner rule is modeled
(the legacy KA adapter, mirroring the legacy engine which has no corner handling).

## Inheritance

`"inherits": "<packId>"` names another pack in this directory. Resolution:

1. Resolve the parent pack fully first (chains allowed; current data uses depth 1).
2. Shallow top-level merge: any key present in the child **replaces** the parent's
   value wholesale (arrays and objects are replaced, never element-merged).
3. Keys absent from the child are taken from the resolved parent.

Only the AP authority packs (`ap-crda`, `ap-tuda`, `ap-vmrda`) inherit, from
`ap-dpms-common`. They carry identification fields plus `notes` overrides only.

## Cases file — `cases/residential-cases.json`

A bare JSON array. Each case:

```json
{
  "case": "ghmc-30x40-111.5sqm-9m-road-g1",
  "packId": "tg-ghmc",
  "plotAreaSqm": 111.5,
  "roadWidthM": 9,
  "heightM": 7,
  "cornerPlot": true,
  "note": "optional",
  "confidence": "verified",
  "expect": {
    "frontM": 1.5,
    "rearM": 1.0,
    "sideM": 1.0,
    "maxHeightM": 15,
    "farAllowed": null,
    "instantApprovalEligible": false,
    "cornerSecondFront": true
  }
}
```

- Inputs: `case` (unique id), `packId`, `plotAreaSqm`, `roadWidthM`, `heightM`;
  optional `cornerPlot` (boolean, default false).
- `expect.frontM/rearM/sideM` come from the matching setback band;
  `expect.maxHeightM` from the matching `heightByRoad` band;
  `expect.farAllowed` = `far.value` (may be `null`);
  `expect.instantApprovalEligible` per the instantApproval rule above.
- `expect.cornerSecondFront` is asserted only on cases with `cornerPlot: true` and
  equals the pack's `cornerPlot.secondFrontSetback`.
- Optional `note` / `confidence` per case; `confidence: "verified"` is used only where
  the expectation is checked against a file in this repo (the KA legacy cases verify
  1:1 against `fixtures/code_rules.json`), not against external law.
- Evaluation: resolve inheritance, match bands with `[min, max)` semantics, compare
  every key present in `expect` exactly.

## Authoring rules

1. Pack values for the common residential bands (plots <= ~500 m2) must stay
   numerically CONSISTENT with `fixtures/code_rules.json` — that file is the calibrated
   engine baseline. Where researched knowledge disagrees, keep the baseline number and
   record the discrepancy in the band's `note` (and/or the pack `notes` discrepancy log).
2. Do not invent granularity: no road-width or height splits unless supportable.
3. Plain ASCII, strictly parseable JSON (no comments, no trailing commas).
4. Room-level minimums are never duplicated into packs (`roomMinimums.inheritFrom`).
