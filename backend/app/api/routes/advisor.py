"""The AI plan: one route that has the model word a plan for figures the rules already worked out.

POST /api/advisor/plan   the answers a result was worked out from, in; a plan out.

It exists only when ARTHNITI_AI_ENABLED is true (main.py), and only does anything
for a request that carries the person's explicit tick. The analysis is run again
here by the same rules as POST /api/analysis/run, and the model is given a
description of the result with no figure, place or scheme name in it. It writes
words with placeholders for the figures; services/plan_service.py refuses a
reply that does anything else, asks once more with the reasons, and puts the
rules' own figures in. A reply that fails twice is never shown: the caller gets
a 502 and the advice the rules wrote stays.

Nothing the model wrote, and nothing the person answered, is in an error body or
a log line: a refused reply is logged as the codes of the checks it failed.
"""

from fastapi import APIRouter, HTTPException
from starlette.concurrency import run_in_threadpool

from app.api.routes.intake import ERRORS_LOGGER, refusal
from app.core.meta_client import MetaError
from app.schemas.analysis import IGNORED_FIELDS
from app.schemas.plan import PlanRequest, PlanResponse
from app.services import plan_service as plan
from app.services.analysis_service import run_unified_analysis


def build_router(client, chat_model: str, take):
    router = APIRouter(prefix="/api/advisor", tags=["Advisor"])

    @router.post("/plan", response_model=PlanResponse)
    async def write_plan(request: PlanRequest):
        # The same answers, forwarded the same way as POST /api/analysis/run
        # does. The consent record is that route's; this one has the tick.
        answers = request.answers.model_dump(exclude=IGNORED_FIELDS | {"consent"})
        context = plan.build_context(answers, run_unified_analysis(**answers))
        rejected = []

        for attempt in range(1, plan.MAX_ATTEMPTS + 1):
            # Every try is a call to Meta and is counted, so is the retry.
            take()

            messages = plan.plan_messages(context, request.language, rejected)

            # The call waits on the network, so it runs on a worker thread: the
            # event loop keeps answering other requests meanwhile.
            try:
                reply = await run_in_threadpool(
                    client.complete_json,
                    chat_model,
                    messages,
                    plan.SCHEMA_NAME,
                    plan.plan_schema(),
                    plan.MAX_COMPLETION_TOKENS,
                )
                checked = plan.verify_plan(reply, context, request.language)
            except MetaError as error:
                # A reply that was not JSON of the shape asked for is the model's
                # miss, like a plan that fails the checks. Anything else is not
                # a thing to try again.
                if error.kind != "bad_output":
                    raise refusal(error) from None
                rejected = ["shape"]
            except plan.BadPlan as error:
                rejected = error.reasons
            else:
                return {
                    "language": request.language,
                    **plan.render_plan(checked, context),
                    "attempts": attempt,
                }

            # The codes of the checks failed ("digit", "missing"), never the
            # words of the reply: a code may carry a word after its colon.
            ERRORS_LOGGER.warning(
                "the plan was refused on try %d: %s",
                attempt,
                ",".join(sorted({reason.split(":")[0] for reason in rejected})),
            )

        raise HTTPException(502, plan.NO_PLAN)

    return router
