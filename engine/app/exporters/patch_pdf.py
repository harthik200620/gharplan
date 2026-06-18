import re

with open(r"c:\archiproj\engine\app\exporters\pdf.py", "r", encoding="utf-8") as f:
    content = f.read()

# find the start of build_pdf
start_idx = content.find("def build_pdf(")

replacement = """def build_pdf(
    plan: Plan,
    vastu: VastuReport,
    code: CodeReport,
    boq: BoqReport,
    branding: Branding | None = None,
) -> bytes:
    from app.services.design_narrative_service import get_design_narrative
    branding = branding or Branding()
    styles = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=styles["Title"], textColor=BRAND, fontSize=22, spaceAfter=4)
    h2 = ParagraphStyle("h2", parent=styles["Heading2"], textColor=BRAND, spaceBefore=10)
    h3 = ParagraphStyle("h3", parent=styles["Heading3"], textColor=INK, spaceBefore=6, spaceAfter=4)
    small = ParagraphStyle("small", parent=styles["Normal"], fontSize=8, textColor=colors.HexColor("#666666"))
    cap = ParagraphStyle("cap", parent=styles["Normal"], fontSize=7, textColor=colors.HexColor("#888888"), alignment=TA_CENTER)
    body = ParagraphStyle("body", parent=styles["Normal"], fontSize=10, textColor=INK, spaceAfter=8, leading=14)
    bullet = ParagraphStyle("bullet", parent=styles["Normal"], fontSize=10, textColor=INK, spaceAfter=4, leading=14, leftIndent=15, bulletIndent=5)

    story: list = []
    floors = floors_of(plan)
    front = front_face(plan)
    bhk = len([r for r in plan.rooms if r.type.value == "Bedroom"])

    # 1. COVER PAGE
    story.append(Spacer(1, 4 * cm))
    if branding.logo_data_url:
        buf = _decode_logo(branding.logo_data_url)
        if buf:
            try:
                story.append(Image(buf, width=5 * cm, height=5 * cm, kind="proportional"))
            except Exception:
                pass
    story.append(Spacer(1, 2 * cm))
    story.append(Paragraph("Architectural Design Proposal", h1))
    story.append(Paragraph("Preliminary Concept", h2))
    story.append(Spacer(1, 2 * cm))
    
    meta = [
        ["Project:", plan.project.name],
        ["Client:", plan.project.client_name or "-"],
        ["Location:", f"{plan.plot.city.value}, {plan.plot.state.value}"],
        ["Date:", datetime.now().strftime("%d %b %Y")],
    ]
    t = Table(meta, colWidths=[3 * cm, 13 * cm])
    t.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("TEXTCOLOR", (0, 0), (0, -1), BRAND),
        ("FONTSIZE", (0, 0), (-1, -1), 12),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(t)
    story.append(Spacer(1, 2 * cm))
    story.append(Paragraph(branding.studio_name, h2))
    contact = " · ".join(x for x in [branding.address, branding.phone, branding.email, branding.website] if x)
    if contact:
        story.append(Paragraph(contact, body))
    story.append(PageBreak())

    # 2. EXECUTIVE SUMMARY
    story.append(Paragraph("Executive Summary", h1))
    story.append(Spacer(1, 12))
    
    story.append(Paragraph("Plot Details", h3))
    plot_summary = [
        ["Dimensions", f"{plan.plot.width_m:g} x {plan.plot.depth_m:g} m"],
        ["Area", f"{plan.plot.area_sqm:g} sq.m"],
        ["Facing", f"{plan.plot.facing.value}-facing"],
        ["Location", f"{plan.plot.city.value}, {plan.plot.state.value}"],
    ]
    story.append(_table(plot_summary, [5 * cm, 10 * cm], header=False))
    story.append(Spacer(1, 12))
    
    story.append(Paragraph("Project Brief", h3))
    brief_summary = [
        ["Proposed Config", f"{bhk} BHK"],
        ["Number of Floors", "G" + (f"+{len(floors) - 1}" if len(floors) > 1 else "")],
        ["Selected Finish Tier", boq.finish_tier.value.title()],
    ]
    story.append(_table(brief_summary, [5 * cm, 10 * cm], header=False))
    story.append(Spacer(1, 12))
    
    narrative = get_design_narrative(plan.variant_id or "vastu", {"width": plan.plot.width_m}, "Composite", bhk)
    story.append(Paragraph("Design Concept Snapshot", h3))
    story.append(Paragraph(f"<b>{narrative['concept_title']}</b> — {narrative['concept_statement']}", body))
    story.append(PageBreak())

    # 3. DESIGN CONCEPT
    story.append(Paragraph("Design Concept", h1))
    story.append(Paragraph(narrative['concept_title'], h2))
    story.append(Spacer(1, 12))
    
    story.append(Paragraph(narrative['concept_statement'], body))
    story.append(Paragraph(f"<b>Inspired by:</b> {narrative['precedent']}", body))
    story.append(Spacer(1, 12))
    
    story.append(Paragraph("Design Highlights", h3))
    for p in narrative['design_principles']:
        story.append(Paragraph(f"• {p}", bullet))
    
    story.append(Spacer(1, 12))
    story.append(Paragraph("Design Philosophy", h3))
    story.append(Paragraph(f"<b>Spatial Organization:</b> {narrative['spatial_organization']}", body))
    story.append(Paragraph(f"<b>Material Palette:</b> {narrative['material_palette']}", body))
    
    # insert plan here so it's not lost
    story.append(Spacer(1, 12))
    story.append(Paragraph("Floor Plan", h3))
    for f in floors:
        story.append(PlanFlowable(plan, floor=f if len(floors) > 1 else None))
        story.append(Spacer(1, 6))
    story.append(PageBreak())

    # 4. VASTU ANALYSIS
    story.append(Paragraph("Vastu Analysis", h1))
    story.append(Paragraph(f"Overall Score: {vastu.score}/100 — Grade: {vastu.grade}", h2))
    story.append(Paragraph(vastu.disclaimer, small))
    story.append(Spacer(1, 12))
    
    story.append(Paragraph(narrative['vastu_approach'], body))
    story.append(Spacer(1, 12))
    
    vrows = [["Room", "Zone", "Status", "Note"]]
    for r in vastu.rooms + [vastu.brahmasthan]:
        vrows.append([r.room_label, r.zone, r.status.upper(), r.message])
    vt = _table(vrows, [3 * cm, 1.4 * cm, 1.6 * cm, 10.5 * cm])
    vstyle = []
    for i, r in enumerate(vastu.rooms + [vastu.brahmasthan], start=1):
        vstyle.append(("TEXTCOLOR", (2, i), (2, i), STATUS_COLOR.get(r.status, colors.black)))
    vt.setStyle(TableStyle(vstyle))
    story.append(vt)
    story.append(PageBreak())

    # 5. CODE COMPLIANCE
    story.append(Paragraph("Code Compliance", h1))
    story.append(Paragraph(f"Review against {code.state} Bylaws", h2))
    story.append(Paragraph(code.disclaimer, small))
    story.append(Spacer(1, 12))
    
    m = code.metrics
    crows = [
        ["Plot area", f"{m.plot_area_sqm} m2", "Ground coverage", f"{m.ground_coverage_pct}% / {m.max_ground_coverage_pct}%"],
        ["Built-up", f"{m.built_up_sqm} m2", "FAR", f"{m.far_used} / {m.far_allowed}"],
    ]
    ct = Table(crows, colWidths=[3 * cm, 4 * cm, 4 * cm, 5 * cm])
    ct.setStyle(TableStyle([("FONTSIZE", (0, 0), (-1, -1), 9), ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]))
    story.append(ct)
    story.append(Spacer(1, 12))
    
    flagged = [c for c in code.checks if c.status != "pass"]
    all_checks = [c for c in code.checks]
    frows = [["Check", "Actual", "Required", "Status", "Note"]]
    for c in all_checks:
        frows.append([c.label, c.actual or "", c.required or "", c.status.upper(), c.message])
    ft = _table(frows, [3 * cm, 2.5 * cm, 2.5 * cm, 1.5 * cm, 6.5 * cm])
    fstyle = []
    for i, c in enumerate(all_checks, start=1):
        fstyle.append(("TEXTCOLOR", (3, i), (3, i), STATUS_COLOR.get(c.status, colors.black)))
    ft.setStyle(TableStyle(fstyle))
    story.append(ft)
    story.append(Spacer(1, 12))
    story.append(Paragraph("Compliance Summary: " + ("Issues found, redesign recommended." if flagged else "All preliminary checks passed."), body))
    story.append(PageBreak())

    # 6. COST ESTIMATE
    story.append(Paragraph("Cost Estimate", h1))
    story.append(Paragraph(f"Preliminary Estimate — {boq.finish_tier.value.title()} finish, {boq.city.value}", h2))
    story.append(Paragraph("Note: This is a preliminary estimate. Get contractor quotes before budgeting.", h3))
    story.append(Spacer(1, 12))
    
    s = boq.summary
    trows = [
        ["Subtotal", _inr(s.subtotal)],
        [f"GST (CGST {_inr(s.cgst_total)} + SGST {_inr(s.sgst_total)})", _inr(s.gst_total)],
        ["Grand Total", _inr(s.grand_total)],
    ]
    tt = Table(trows, colWidths=[13 * cm, 3.6 * cm])
    tt.setStyle(
        TableStyle(
            [
                ("FONTSIZE", (0, 0), (-1, -1), 10),
                ("ALIGN", (1, 0), (1, -1), "RIGHT"),
                ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
                ("TEXTCOLOR", (0, -1), (-1, -1), BRAND),
                ("LINEABOVE", (0, -1), (-1, -1), 0.6, BRAND),
            ]
        )
    )
    story.append(tt)
    
    if plan.plot.area_sqm > 0 and m.built_up_sqm > 0:
        story.append(Paragraph(f"Approximate Per Sq Ft Rate: {_inr(s.grand_total / (m.built_up_sqm * 10.764))}/sqft built-up", body))
    story.append(Spacer(1, 12))
    
    # Trade-wise summary instead of massive line-items for brevity in proposal
    story.append(Paragraph("Trade-wise Breakdown", h3))
    trades = {}
    for ln in boq.lines:
        cat = getattr(ln, 'category', 'General')
        trades[cat] = trades.get(cat, 0) + ln.total
        
    trade_rows = [["Category", "Amount"]]
    for cat, amt in trades.items():
        trade_rows.append([cat, _inr(amt)])
        
    story.append(_table(trade_rows, [10 * cm, 6 * cm]))
    
    story.append(Spacer(1, 12))
    story.append(Paragraph(boq.disclaimer, small))
    story.append(PageBreak())

    # 7. WHAT'S NEXT
    story.append(Paragraph("What's Next", h1))
    story.append(Paragraph("Recommended Next Steps", h2))
    story.append(Spacer(1, 12))
    
    steps = [
        "Engage a registered architect for detailed working drawings and finishes.",
        "Commission a structural engineer to design the foundations and framework.",
        "Submit drawings to BMRDA/DTCP/local authority for building permit approval.",
        "Shortlist local contractors and obtain at least 3 competitive quotes.",
        "Start construction with proper site supervision and quality checks."
    ]
    
    for i, step in enumerate(steps, start=1):
        story.append(Paragraph(f"<b>{i}.</b> {step}", body))
        story.append(Spacer(1, 6))
        
    story.append(Spacer(1, 1 * cm))
    story.append(Paragraph("Disclaimer", h3))
    story.append(Paragraph("This is an AI-generated architectural concept and feasibility report. It is NOT meant for construction. You must engage qualified professionals (Architect, Structural Engineer) to verify the design, structural safety, and local code compliance before breaking ground.", body))
    story.append(Spacer(1, 1 * cm))
    story.append(Paragraph("Terms &amp; Conditions", h3))
    story.append(Paragraph(branding.terms, small))

    doc = SimpleDocTemplate(
        (buf_out := io.BytesIO()),
        pagesize=A4,
        leftMargin=15 * mm,
        rightMargin=15 * mm,
        topMargin=15 * mm,
        bottomMargin=18 * mm,
        title=f"GharPlan Proposal — {plan.project.name}",
    )
    doc.build(story, onFirstPage=_footer, onLaterPages=_footer)
    return buf_out.getvalue()
"""

new_content = content[:start_idx] + replacement

with open(r"c:\archiproj\engine\app\exporters\pdf.py", "w", encoding="utf-8") as f:
    f.write(new_content)

print("patched pdf.py successfully")
