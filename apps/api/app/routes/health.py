import uuid
from fastapi import APIRouter
from ..guards.budget import get_budget_status
from ..guards.session import create_session_token

router = APIRouter()

@router.get("/health")
async def health_check():
    session_id = f"sess-{uuid.uuid4().hex[:12]}"
    token = create_session_token(session_id)
    budget = get_budget_status()
    
    return {
        "status": "ok",
        "budget": budget,
        "token": token,
        "sessionId": session_id
    }
