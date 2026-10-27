from fastapi import APIRouter, Request

from app.core.processing_log import note_analysis
from app.schemas.analysis import (
    IGNORED_FIELDS,
    ConsentedAnalysisRequest,
    UnifiedAnalysisRequest,
    UnifiedAnalysisResponse,
)
from app.services.analysis_service import run_unified_analysis


def build_router(require_consent=False, log_hash_key=None):
    """The analysis router, built for one deployment's settings.

    With require_consent the body model is ConsentedAnalysisRequest, so a
    request without a consent record is refused by validation, with the same
    422 shape as any other missing field (loc ["body", "consent"]).
    """
    router = APIRouter(
        prefix="/api/analysis",
        tags=["Analysis"],
    )

    body_model = ConsentedAnalysisRequest if require_consent else UnifiedAnalysisRequest

    @router.post(
        "/run",
        response_model=UnifiedAnalysisResponse,
    )
    def run_analysis(
        request: body_model,
        http_request: Request,
    ):
        # The consent record and a code computed from the answers go to the
        # processing log line; neither reaches the analysis or the response.
        note_analysis(http_request, request, log_hash_key)

        # Every field is forwarded except the accepted-and-ignored ones and the
        # consent record. Forwarding by dump rather than by name means a field
        # added to the model reaches the service, or fails loudly with a
        # TypeError, instead of being validated and then silently dropped: that
        # is how household_monthly_income was first left out.
        return run_unified_analysis(
            **request.model_dump(exclude=IGNORED_FIELDS | {"consent"})
        )

    return router
