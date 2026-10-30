import hmac
import hashlib
import time
import json
import base64
from typing import Dict, Any, Optional
from ..config import settings

# Per-session call tracking: sessionId -> counts
session_usage: Dict[str, Dict[str, int]] = {}

def create_session_token(session_id: str) -> str:
    payload = {
        "sid": session_id,
        "ts": int(time.time())
    }
    raw = json.dumps(payload, separators=(',', ':')).encode('utf-8')
    sig = hmac.new(settings.SESSION_SECRET.encode('utf-8'), raw, hashlib.sha256).digest()
    return f"{base64.urlsafe_b64encode(raw).decode('utf-8')}.{base64.urlsafe_b64encode(sig).decode('utf-8')}"

def verify_session_token(token: str) -> Optional[str]:
    if not token or "." not in token:
        return None
    try:
        raw_b64, sig_b64 = token.split(".", 1)
        raw = base64.urlsafe_b64decode(raw_b64)
        sig = base64.urlsafe_b64decode(sig_b64)
        expected_sig = hmac.new(settings.SESSION_SECRET.encode('utf-8'), raw, hashlib.sha256).digest()
        if not hmac.compare_digest(sig, expected_sig):
            return None
        payload = json.loads(raw.decode('utf-8'))
        return payload.get("sid")
    except Exception:
        return None

def check_and_increment_session_cap(session_id: str, op_type: str) -> bool:
    """Returns True if within cap, False if exceeded."""
    if session_id not in session_usage:
        session_usage[session_id] = {
            "followups": 0,
            "adjudicate": 0,
            "bankgen": 0,
            "report": 0
        }
    
    counts = session_usage[session_id]
    
    if op_type == "followup":
        if counts["followups"] >= settings.CAP_FOLLOWUPS_PER_SESSION:
            return False
        counts["followups"] += 1
        return True
    elif op_type == "adjudicate":
        if counts["adjudicate"] >= settings.CAP_ADJUDICATE_PER_SESSION:
            return False
        counts["adjudicate"] += 1
        return True
    elif op_type == "bankgen":
        if counts["bankgen"] >= settings.CAP_BANKGEN_PER_SESSION:
            return False
        counts["bankgen"] += 1
        return True
    elif op_type == "report":
        if counts["report"] >= 1:
            return False
        counts["report"] += 1
        return True
    return True
