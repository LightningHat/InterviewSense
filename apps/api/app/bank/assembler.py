import hashlib
import json
import re
from typing import List, Dict, Any
from .validator import validate_bank_python

SENSITIVE_WORDS = [
  "age", "gender", "race", "religion", "family", "children", "health", 
  "marital", "pregnant", "citizenship", "nationality", "political"
]

def sanitize_question_text(text: str, max_words: int = 40) -> str:
    words = text.strip().split()
    if len(words) > max_words:
        return " ".join(words[:max_words]) + "?"
    return text.strip()

def contains_sensitive_topics(text: str) -> bool:
    lower = text.lower()
    for word in SENSITIVE_WORDS:
        if re.search(r'\b' + re.escape(word) + r'\b', lower):
            return True
    return False

def assemble_bank(
    pool_questions: List[Dict[str, Any]],
    resume_questions: List[Dict[str, Any]],
    profile_hash: str
) -> Dict[str, Any]:
    """
    Merges pool questions and resume questions, assigns IDs,
    builds the `next` DAG, and validates the bank.
    """
    combined: List[Dict[str, Any]] = []

    # 1. Process pool questions
    for i, q in enumerate(pool_questions):
        q_copy = json.loads(json.dumps(q))
        q_copy["id"] = f"q-pool-{i+1}"
        q_copy["origin"] = "pool"
        q_copy["text"] = sanitize_question_text(q_copy["text"])
        combined.append(q_copy)

    # 2. Process and filter resume questions
    valid_resume_questions: List[Dict[str, Any]] = []
    for i, q in enumerate(resume_questions):
        text = q.get("text", "")
        if contains_sensitive_topics(text):
            continue
        q_copy = json.loads(json.dumps(q))
        q_copy["id"] = f"q-res-{i+1}"
        q_copy["origin"] = "resume"
        q_copy["text"] = sanitize_question_text(text)
        
        # Ensure concepts have static follow-up
        concepts = q_copy.get("concepts", [])
        if concepts:
            heaviest = max(concepts, key=lambda c: c.get("weight", 1))
            h_id = heaviest.get("id", "c1")
            if "staticFollowups" not in q_copy or h_id not in q_copy["staticFollowups"]:
                q_copy["staticFollowups"] = {
                    h_id: f"Could you elaborate on {heaviest.get('text', 'that')}?"
                }
        valid_resume_questions.append(q_copy)

    # Interleave resume questions into the flow (e.g. after question 1, 3, etc.)
    all_questions: List[Dict[str, Any]] = []
    r_idx = 0
    for idx, pq in enumerate(combined):
        all_questions.append(pq)
        if r_idx < len(valid_resume_questions) and (idx == 1 or idx == 3 or idx == len(combined) - 1):
            all_questions.append(valid_resume_questions[r_idx])
            r_idx += 1
            
    while r_idx < len(valid_resume_questions):
        all_questions.append(valid_resume_questions[r_idx])
        r_idx += 1

    # 3. Build deterministic next graph
    n = len(all_questions)
    for i in range(n):
        curr = all_questions[i]
        curr["next"] = {}
        
        if i < n - 1:
            next_linear = all_questions[i + 1]["id"]
            # Strong: jump ahead +2 if exists, else +1
            strong_target = all_questions[min(i + 2, n - 1)]["id"] if i + 2 < n else next_linear
            # Partial: next linear +1
            partial_target = next_linear
            # Weak: branch to foundational or linear next
            weak_target = next_linear
            
            curr["next"] = {
                "strong": strong_target,
                "partial": partial_target,
                "weak": weak_target
            }
        else:
            # Terminal question
            curr["next"] = {}

    bank = {
        "id": f"gen-{profile_hash[:8]}",
        "version": 1,
        "title": "Tailored Technical Interview",
        "source": "generated",
        "profileHash": profile_hash,
        "config": {
            "maxQuestions": min(len(all_questions), 8),
            "maxFollowupsPerQuestion": 1,
            "T_cover": 0.55,
            "T_off": 0.25
        },
        "questions": all_questions
    }

    # Validate the generated bank
    val = validate_bank_python(bank)
    if not val["valid"]:
        # Fallback to pool-only questions if assembly failed
        pool_only = [json.loads(json.dumps(q)) for q in combined]
        for i in range(len(pool_only)):
            pool_only[i]["next"] = {
                "strong": pool_only[min(i + 1, len(pool_only) - 1)]["id"],
                "partial": pool_only[min(i + 1, len(pool_only) - 1)]["id"],
                "weak": pool_only[min(i + 1, len(pool_only) - 1)]["id"]
            } if i < len(pool_only) - 1 else {}
            
        bank["questions"] = pool_only
        bank["config"]["maxQuestions"] = len(pool_only)

    return bank

