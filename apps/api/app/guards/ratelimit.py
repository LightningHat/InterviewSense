import time
from typing import Dict, List
from ..config import settings

ip_request_history: Dict[str, List[float]] = {}
WINDOW_SECONDS = 600 # 10 minutes

def check_rate_limit(client_ip: str) -> bool:
    """Returns True if within rate limit, False if rate limited."""
    now = time.time()
    cutoff = now - WINDOW_SECONDS
    
    history = ip_request_history.get(client_ip, [])
    # Filter out timestamps outside the sliding window
    valid_history = [t for t in history if t > cutoff]
    
    if len(valid_history) >= settings.RATE_LIMIT_PER_10MIN:
        ip_request_history[client_ip] = valid_history
        return False
    
    valid_history.append(now)
    ip_request_history[client_ip] = valid_history
    return True
