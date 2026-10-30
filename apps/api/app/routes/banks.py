import json
from pathlib import Path
from fastapi import APIRouter, HTTPException

router = APIRouter()

SEED_BANK_PATH = Path(__file__).resolve().parents[4] / "packages" / "banks" / "src" / "seed-embedded.json"

@router.get("/banks/{bank_id}")
async def get_bank(bank_id: str):
    if bank_id != "embedded-v1":
        raise HTTPException(status_code=404, detail="Bank not found")
        
    if not SEED_BANK_PATH.exists():
        raise HTTPException(status_code=500, detail="Seed bank file missing")
        
    with open(SEED_BANK_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
        
    return data

