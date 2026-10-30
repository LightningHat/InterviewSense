import json
from pathlib import Path
from typing import List, Dict, Any
from ..schemas import Profile, Question

POOL_FILE_PATH = Path(__file__).resolve().parents[4] / "packages" / "banks" / "src" / "tagged-pool.json"

_cached_pool: List[Dict[str, Any]] = []

def get_pool() -> List[Dict[str, Any]]:
    global _cached_pool
    if not _cached_pool:
        if POOL_FILE_PATH.exists():
            with open(POOL_FILE_PATH, "r", encoding="utf-8") as f:
                _cached_pool = json.load(f)
        else:
            # Fallback inline minimal pool if path is resolved differently
            _cached_pool = []
    return _cached_pool

def select_pool_questions(profile: Profile, count: int = 5) -> List[Dict[str, Any]]:
    pool = get_pool()
    if not pool:
        return []

    profile_skills = set(s.lower() for s in profile.skills)
    profile_domains = set(d.lower() for d in profile.domains)
    candidate_level = profile.level.lower()

    scored_questions = []

    for q in pool:
        score = 0
        q_skills = set(s.lower() for s in q.get("skills", []))
        q_domain = q.get("domain", "").lower()
        q_level = q.get("level", "").lower()

        # Skill overlap (highest weight)
        overlap = len(profile_skills.intersection(q_skills))
        score += overlap * 4

        # Domain match
        if q_domain in profile_domains:
            score += 3

        # Level match
        if q_level == candidate_level:
            score += 2

        scored_questions.append((score, q))

    # Sort descending by score, tie-break by difficulty
    scored_questions.sort(key=lambda item: (item[0], -item[1].get("difficulty", 1)), reverse=True)
    
    selected = [item[1] for item in scored_questions[:count]]
    # Order chosen questions by ascending difficulty for progressive interview flow
    selected.sort(key=lambda q: q.get("difficulty", 1))
    
    return selected

