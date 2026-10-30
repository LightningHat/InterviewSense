import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    LLM_PROVIDER: str = os.getenv("LLM_PROVIDER", "mock")
    LLM_API_KEY: str = os.getenv("LLM_API_KEY", "")
    MODEL_FOLLOWUP: str = os.getenv("MODEL_FOLLOWUP", "gpt-4o-mini")
    MODEL_REPORT: str = os.getenv("MODEL_REPORT", "gpt-4o")
    MODEL_BANKGEN: str = os.getenv("MODEL_BANKGEN", "gpt-4o-mini")
    
    SESSION_SECRET: str = os.getenv("SESSION_SECRET", "interviewsense-secret-key-32chars-min!!")
    ALLOWED_ORIGIN: str = os.getenv("ALLOWED_ORIGIN", "http://localhost:5173")
    
    BUDGET_DAILY_USD: float = float(os.getenv("BUDGET_DAILY_USD", "2.0"))
    BUDGET_MONTHLY_USD: float = float(os.getenv("BUDGET_MONTHLY_USD", "30.0"))
    
    CAP_FOLLOWUPS_PER_SESSION: int = int(os.getenv("CAP_FOLLOWUPS_PER_SESSION", "12"))
    CAP_ADJUDICATE_PER_SESSION: int = int(os.getenv("CAP_ADJUDICATE_PER_SESSION", "3"))
    CAP_BANKGEN_PER_SESSION: int = int(os.getenv("CAP_BANKGEN_PER_SESSION", "2"))
    RATE_LIMIT_PER_10MIN: int = int(os.getenv("RATE_LIMIT_PER_10MIN", "30"))

settings = Settings()
