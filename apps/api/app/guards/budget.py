import time
from typing import Literal
from ..config import settings

# In-memory budget counters (resets daily/monthly)
daily_spend_usd = 0.0
monthly_spend_usd = 0.0
last_day_reset = time.strftime("%Y-%m-%d")
last_month_reset = time.strftime("%Y-%m")

# Cost estimates per 1k tokens (approximate average across input/output)
COST_PER_1K_IN = 0.00015
COST_PER_1K_OUT = 0.0006

def _check_and_reset():
    global daily_spend_usd, monthly_spend_usd, last_day_reset, last_month_reset
    current_day = time.strftime("%Y-%m-%d")
    current_month = time.strftime("%Y-%m")
    
    if current_day != last_day_reset:
        daily_spend_usd = 0.0
        last_day_reset = current_day
        
    if current_month != last_month_reset:
        monthly_spend_usd = 0.0
        last_month_reset = current_month

def get_budget_status() -> Literal['ok', 'degraded', 'exhausted']:
    _check_and_reset()
    
    if daily_spend_usd >= settings.BUDGET_DAILY_USD or monthly_spend_usd >= settings.BUDGET_MONTHLY_USD:
        return 'exhausted'
        
    if daily_spend_usd >= (settings.BUDGET_DAILY_USD * 0.8) or monthly_spend_usd >= (settings.BUDGET_MONTHLY_USD * 0.8):
        return 'degraded'
        
    return 'ok'

def record_token_usage(prompt_tokens: int, completion_tokens: int):
    global daily_spend_usd, monthly_spend_usd
    _check_and_reset()
    
    cost = (prompt_tokens / 1000.0 * COST_PER_1K_IN) + (completion_tokens / 1000.0 * COST_PER_1K_OUT)
    daily_spend_usd += cost
    monthly_spend_usd += cost
