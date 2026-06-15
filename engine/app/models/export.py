"""Export request models (studio branding for proposals)."""

from __future__ import annotations

from typing import Optional

from .base import CamelModel
from .boq import BoqOptions, ExtraLine, LineOverride
from .enums import City, FinishTier
from .plan import Plan


class Branding(CamelModel):
    studio_name: str = "Your Studio"
    address: str = ""
    gstin: str = ""
    phone: str = ""
    email: str = ""
    website: str = ""
    # base64 data URL (e.g. "data:image/png;base64,...") uploaded from the web app
    logo_data_url: Optional[str] = None
    terms: str = (
        "1. This proposal is indicative and valid for 15 days. "
        "2. Rates are subject to final measurement and site conditions. "
        "3. GST as applicable. 4. This is not an approved or stamped drawing."
    )


class ExportRequest(CamelModel):
    plan: Plan
    city: Optional[City] = None
    finish_tier: FinishTier = FinishTier.standard
    branding: Branding = Branding()
    # BOQ edits so PDF/XLSX match the on-screen editable BOQ.
    options: BoqOptions = BoqOptions()
    overrides: list[LineOverride] = []
    extra_lines: list[ExtraLine] = []
