"""Per-Generate variation seed (app.generator.designer).

The contract:
  * ``seed == 0`` (the default) reproduces the deterministic plan byte-for-byte —
    the invariant that keeps every other determinism test valid.
  * A nonzero seed is reproducible: same seed → same plan.
  * On a plot with slack, different seeds surface genuinely different geometry
    (this is the fix for "every Generate returns the same house").
  * Variation only re-orders candidates already tied on the hard quality gates, so
    a seeded plan never drops an essential room or fails code.
"""

from __future__ import annotations

from app.generator.designer import generate_options, generate_plan
from app.models.plan import Plot

W30x40 = 9.144
D30x40 = 12.192


def _plot(w=W30x40, d=D30x40, state="KA", city="Bengaluru", facing="E", floors=1):
    return Plot.model_validate(
        {"widthM": w, "depthM": d, "facing": facing, "state": state,
         "city": city, "floors": floors}
    )


def _sig(plan):
    """A stable geometry fingerprint: each room id + its rounded polygon."""
    return [
        (r.id, tuple((round(x, 3), round(y, 3)) for x, y in r.polygon))
        for r in plan.rooms
    ]


def test_seed_zero_is_the_deterministic_default():
    """seed=0 and the no-seed call produce byte-identical geometry AND Vastu — the
    invariant the rest of the determinism suite relies on."""
    plan_a, vastu_a, _, _ = generate_plan(3, _plot(w=12.0, d=15.0), seed=0)
    plan_b, vastu_b, _, _ = generate_plan(3, _plot(w=12.0, d=15.0))
    assert _sig(plan_a) == _sig(plan_b)
    assert vastu_a.score == vastu_b.score


def test_same_seed_is_reproducible():
    a, _, _, _ = generate_plan(3, _plot(w=15.0, d=18.0), seed=4242)
    b, _, _, _ = generate_plan(3, _plot(w=15.0, d=18.0), seed=4242)
    assert _sig(a) == _sig(b)


def test_different_seeds_vary_the_layout_on_a_roomy_plot():
    """On a plot with slack the ranking has many equally-good candidates, so
    different seeds must surface genuinely different geometry."""
    base_sig = _sig(generate_plan(3, _plot(w=15.0, d=18.0), seed=0)[0])
    varied = [
        generate_plan(3, _plot(w=15.0, d=18.0), seed=s)[0]
        for s in (1, 2, 3, 5, 8, 13, 21)
    ]
    assert any(_sig(v) != base_sig for v in varied), "no seed changed the layout"


def test_seeded_plans_stay_legal_and_complete():
    """Variation only re-orders candidates already tied on the hard gates, so every
    seed stays code-clean and drops no essential room."""
    for s in (0, 1, 2, 3, 5, 8, 13, 21, 34):
        _, _, code, meta = generate_plan(3, _plot(w=15.0, d=18.0), seed=s)
        assert code.summary.fail_count == 0, f"seed {s} produced a code fail"
        dropped = meta.get("droppedRooms", [])
        assert all(
            d not in ("living", "kitchen", "master_bedroom") for d in dropped
        ), f"seed {s} dropped an essential room: {dropped}"


def test_options_seed_zero_matches_the_default_set():
    a = generate_options(3, _plot(w=12.0, d=15.0), seed=0)
    b = generate_options(3, _plot(w=12.0, d=15.0))
    assert [o["variantId"] for o in a] == [o["variantId"] for o in b]
    assert [_sig(o["plan"]) for o in a] == [_sig(o["plan"]) for o in b]


def test_options_vary_with_seed():
    base = [_sig(o["plan"]) for o in generate_options(3, _plot(w=15.0, d=18.0), seed=0)]
    seeded = [_sig(o["plan"]) for o in generate_options(3, _plot(w=15.0, d=18.0), seed=99)]
    assert base != seeded, "seed did not change any option's geometry"
