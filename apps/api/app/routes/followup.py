from fastapi import APIRouter, HTTPException
from ..schemas import FollowupRequest, FollowupResponse
from ..guards.session import check_and_increment_session_cap
from ..guards.budget import get_budget_status
from ..llm.provider import complete

router = APIRouter()

SYSTEM_FOLLOWUP_PROMPT = (
    "You are a concise technical interviewer. Given the question, what the candidate covered, "
    "and what they missed, ask exactly one short follow-up (max 20 words) targeting the first missed point. "
    "Do not reveal the answer. Output JSON only: {\"followup\": string}."
)

SYSTEM_ADJUDICATE_PROMPT = (
    "You are an impartial scoring adjudicator. Given the candidate's truncated answer and question rubric, "
    "determine if their answer demonstrates strong, partial, or weak comprehension, and suggest an optional brief clarifying question. "
    "Output JSON only: {\"band\": \"strong|partial|weak\", \"followup\": string|null}."
)

SYSTEM_REPHRASE_PROMPT = (
    "You are a supportive technical interviewer. The candidate gave an off-topic response. "
    "Rephrase the technical question in a simpler, more direct way in under 25 words. "
    "Output JSON only: {\"followup\": string}."
)

SYSTEM_SUMMARIZE_PROMPT = (
    "You are a technical interview recorder. Compress this rolling summary into max 4 concise bullet lines under 80 words. "
    "Output JSON only: {\"summary\": string}."
)

@router.post("/followup", response_model=FollowupResponse)
async def handle_followup(req: FollowupRequest):
    # 1. Check budget status
    if get_budget_status() == "exhausted":
        raise HTTPException(
            status_code=402,
            detail={"error": {"code": "budget_exhausted", "message": "API monthly budget limit reached", "retryable": False}}
        )

    # 2. Check session cap
    op_type = "adjudicate" if req.mode == "adjudicate" else "followup"
    if not check_and_increment_session_cap(req.sessionId, op_type):
        raise HTTPException(
            status_code=429,
            detail={"error": {"code": "session_cap", "message": f"Per-session {op_type} cap reached", "retryable": False}}
        )

    # 3. Select prompt and build messages
    if req.mode == "adjudicate":
        sys_prompt = SYSTEM_ADJUDICATE_PROMPT
        user_content = f"Question: {req.question}\nAnswer points: {req.answerPoints}\nMissing: {', '.join(req.missing)}\nCandidate words: {req.rawAnswer or ''}"
        max_tokens = 60
        tier = "followup"
    elif req.mode == "rephrase":
        sys_prompt = SYSTEM_REPHRASE_PROMPT
        user_content = f"Original Question: {req.question}"
        max_tokens = 60
        tier = "followup"
    elif req.mode == "summarize":
        sys_prompt = SYSTEM_SUMMARIZE_PROMPT
        user_content = f"Rolling Summary:\n{req.summary}"
        max_tokens = 120
        tier = "followup"
    else:
        sys_prompt = SYSTEM_FOLLOWUP_PROMPT
        user_content = f"Question: {req.question}\nCovered: {req.answerPoints}\nMissing: {', '.join(req.missing)}"
        max_tokens = 60
        tier = "followup"

    messages = [
        {"role": "system", "content": sys_prompt},
        {"role": "user", "content": user_content}
    ]

    try:
        result = await complete(messages, max_tokens=max_tokens, model_tier=tier, response_format="json")
        return FollowupResponse(
            followup=result.get("followup"),
            band=result.get("band"),
            summary=result.get("summary")
        )
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail={"error": {"code": "provider_error", "message": str(e), "retryable": True}}
        )

