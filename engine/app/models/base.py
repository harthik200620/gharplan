"""Shared pydantic base model.

All API models inherit ``CamelModel`` so the JSON wire format stays camelCase
(``widthM``, ``areaSqm``, ``ceilingHeightM`` ...) while Python code uses idiomatic
snake_case. ``populate_by_name=True`` means both forms parse on input (camelCase
from the web, snake_case from tests/fixtures); responses always serialize by alias.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        ser_json_by_alias=True,
    )
