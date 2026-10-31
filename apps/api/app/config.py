import os
from pathlib import Path
from dotenv import load_dotenv

# Load from apps/api/.env or root .env
env_path = Path(__file__).resolve().parents[1] / ".env"
if env_path.exists():
    load_dotenv(dotenv_path=env_path)
else:
    load_dotenv()

class Settings:
    LLM_PROVIDER: str = os.getenv("LLM_PROVIDER", "mock")
    LLM_API_KEY: str = os.getenv("LLM_API_KEY", "")
    LLM_FALLBACK_API_KEYS: str = os.getenv("LLM_FALLBACK_API_KEYS", "")
    MODEL_FOLLOWUP: str = os.getenv("MODEL_FOLLOWUP", "gpt-4o-mini")
    MODEL_REPORT: str = os.getenv("MODEL_REPORT", "gpt-4o")
    MODEL_BANKGEN: str = os.getenv("MODEL_BANKGEN", "gpt-4o-mini")

    @property
    def api_keys(self) -> list[str]:
        keys: list[str] = []
        # Support comma-delimited keys in LLM_API_KEY
        if self.LLM_API_KEY:
            for k in self.LLM_API_KEY.split(","):
                k = k.strip()
                if k and k not in keys:
                    keys.append(k)
        # Support comma-delimited fallback keys
        if self.LLM_FALLBACK_API_KEYS:
            for k in self.LLM_FALLBACK_API_KEYS.split(","):
                k = k.strip()
                if k and k not in keys:
                    keys.append(k)
        return keys
    
    SESSION_SECRET: str = os.getenv("SESSION_SECRET", "interviewsense-secret-key-32chars-min!!")
    ALLOWED_ORIGIN: str = os.getenv("ALLOWED_ORIGIN", "http://localhost:5173")
    
    BUDGET_DAILY_USD: float = float(os.getenv("BUDGET_DAILY_USD", "2.0"))
    BUDGET_MONTHLY_USD: float = float(os.getenv("BUDGET_MONTHLY_USD", "30.0"))
    
    CAP_FOLLOWUPS_PER_SESSION: int = int(os.getenv("CAP_FOLLOWUPS_PER_SESSION", "12"))
    CAP_ADJUDICATE_PER_SESSION: int = int(os.getenv("CAP_ADJUDICATE_PER_SESSION", "3"))
    CAP_BANKGEN_PER_SESSION: int = int(os.getenv("CAP_BANKGEN_PER_SESSION", "2"))
    RATE_LIMIT_PER_10MIN: int = int(os.getenv("RATE_LIMIT_PER_10MIN", "30"))

settings = Settings()

