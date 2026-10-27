"""The AI plan's request and response models (api/routes/advisor.py)."""

from typing import Annotated, Literal

from pydantic import BaseModel, BeforeValidator

from app.schemas.analysis import UnifiedAnalysisRequest
from app.schemas.intake import Language


def only_true(value):
    # Literal[True] alone also takes 1 and 1.0, and this tick is the person's
    # agreement to send a description of their business to Meta: only a real
    # true counts. Any other value is turned into one that Literal refuses.
    return value if value is True else "not true"


class PlanRequest(BaseModel):
    # The same answers POST /api/analysis/run took; the analysis is run again
    # here, so the plan is written for what the rules make of exactly these.
    answers: UnifiedAnalysisRequest
    language: Language
    send_to_meta: Annotated[Literal[True], BeforeValidator(only_true)]


class Segment(BaseModel):
    # "text" is the model's wording; "fill" is a figure or name the rules put in.
    t: Literal["text", "fill"]
    v: str


class PlanResponse(BaseModel):
    language: Language
    summary: list[Segment]
    steps: list[list[Segment]]
    cautions: list[list[Segment]]
    attempts: int
