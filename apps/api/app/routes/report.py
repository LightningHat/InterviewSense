from fastapi import APIRouter, HTTPException
from ..schemas import ReportRequest, ReportResponse
from ..guards.session import check_and_increment_session_cap
from ..guards.budget import get_budget_status
from ..llm.provider import complete

router = APIRouter()

SYSTEM_REPORT_PROMPT = (
    "You are a senior technical hiring manager reviewing structured candidate interview performance records. "
    "Based ONLY on the provided per-question performance telemetry (bands, covered concepts, missing concepts, delivery metrics), "
    "generate a rigorous, constructive interview evaluation report. "
    "Output strict JSON only with format: "
    "{\"overall\": string, \"strengths\": string[], \"gaps\": string[], \"advice\": string[], \"score_0_100\": number}."
)

@router.post("/report", response_model=ReportResponse)
async def generate_report(req: ReportRequest):
    # 1. Budget check
    if get_budget_status() == "exhausted":
        # Fall back to deterministic template report on exhausted budget
        return ReportResponse(
            overall="Completed practice interview session with standard rubric evaluation.",
            strengths=["Attempted all assigned questions", "Maintained consistent speech cadence"],
            gaps=["Detailed technical concept elaboration could be deepened"],
            advice=["Review underlying hardware and architecture concepts"],
            score_0_100=70
        )

    # 2. Session cap: 1 report per session
    if not check_and_increment_session_cap(req.sessionId, "report"):
        raise HTTPException(
            status_code=429,
            detail={"error": {"code": "session_cap", "message": "Evaluation report already generated for this session", "retryable": False}}
        )

    # Format telemetry lines (no raw transcripts)
    telemetry_lines = []
    total_wpm = 0
    strong_count = 0
    
    for t in req.turns:
        line = f"Question {t.questionId}: band={t.band}, covered={len(t.covered)}, missing={len(t.missing)}, wpm={t.delivery.wpm}"
        telemetry_lines.append(line)
        total_wpm += t.delivery.wpm
        if t.band == "strong":
            strong_count += 1
            
    avg_wpm = round(total_wpm / max(len(req.turns), 1))
    user_content = f"Session telemetry ({len(req.turns)} turns, avg WPM {avg_wpm}):\n" + "\n".join(telemetry_lines)

    messages = [
        {"role": "system", "content": SYSTEM_REPORT_PROMPT},
        {"role": "user", "content": user_content}
    ]

    try:
        result = await complete(messages, max_tokens=500, model_tier="report", response_format="json")
        return ReportResponse(
            overall=result.get("overall", "Evaluation completed successfully."),
            strengths=result.get("strengths", ["Clear technical articulation"]),
            gaps=result.get("gaps", ["Some complex edge cases missed"]),
            advice=result.get("advice", ["Practice concise concept definitions"]),
            score_0_100=int(result.get("score_0_100", 75))
        )
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail={"error": {"code": "provider_error", "message": str(e), "retryable": True}}
        )
