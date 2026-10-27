"""The voice-and-text helper's request and response models (api/routes/intake.py).

A recording is not a model here: it is the raw body of POST /api/intake/transcribe,
and its size cap and format check are in the route.
"""

from typing import Annotated, Literal, Union

from pydantic import BaseModel, StringConstraints

from app.schemas.limits import MAX_TALK_TEXT
from app.services.intake_service import ASR_LANGUAGES, LANGUAGES


# The interface language codes. Spoken input has one fewer: Meta's speech model
# lists no Malayalam.
Language = Literal[tuple(LANGUAGES)]
SpokenLanguage = Literal[tuple(ASR_LANGUAGES)]


class ExtractRequest(BaseModel):
    text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=MAX_TALK_TEXT)]
    language: Language


class Answer(BaseModel):
    field: str
    value: Union[str, int]
    evidence: str


class ExtractResponse(BaseModel):
    answers: list[Answer]
    ignored: int


class TranscribeResponse(BaseModel):
    transcript: str
