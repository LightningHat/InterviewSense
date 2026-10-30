from typing import Dict, Any, List, Set
from ..schemas import QuestionBank

def validate_bank_python(bank_data: Dict[str, Any]) -> Dict[str, Any]:
    errors: List[str] = []
    
    questions = bank_data.get("questions", [])
    if not questions:
        return {"valid": False, "errors": ["Question bank has no questions"]}
        
    question_map = {}
    
    # 1. Unique IDs and concepts
    for q in questions:
        qid = q.get("id")
        if not qid:
            errors.append("Question missing id")
            continue
            
        if qid in question_map:
            errors.append(f"Duplicate question id: {qid}")
        question_map[qid] = q
        
        concepts = q.get("concepts", [])
        if len(concepts) < 2:
            errors.append(f"Question {qid} must have at least 2 concepts")
            
        concept_ids = set()
        max_weight = -1.0
        heaviest_id = ""
        
        for c in concepts:
            cid = c.get("id")
            if cid in concept_ids:
                errors.append(f"Question {qid} has duplicate concept id: {cid}")
            concept_ids.add(cid)
            
            weight = c.get("weight", 0)
            if weight <= 0:
                errors.append(f"Question {qid} concept {cid} weight must be positive")
            if weight > max_weight:
                max_weight = weight
                heaviest_id = cid
                
        static_followups = q.get("staticFollowups", {})
        if not static_followups or heaviest_id not in static_followups:
            errors.append(f"Question {qid} missing staticFollowups for heaviest concept '{heaviest_id}'")
            
    # 2. Next targets exist
    for q in questions:
        qid = q.get("id")
        next_obj = q.get("next", {})
        for key in ["strong", "partial", "weak"]:
            target = next_obj.get(key)
            if target and target not in question_map:
                errors.append(f"Question {qid} references non-existent target: {target}")
                
    # 3. Reachability from root
    if questions:
        root_id = questions[0].get("id")
        reachable: Set[str] = {root_id}
        queue = [root_id]
        
        while queue:
            curr = queue.pop(0)
            q = question_map.get(curr)
            if not q:
                continue
            next_obj = q.get("next", {})
            for key in ["strong", "partial", "weak"]:
                target = next_obj.get(key)
                if target and target not in reachable:
                    reachable.add(target)
                    queue.append(target)
                    
        for q in questions:
            qid = q.get("id")
            if qid not in reachable:
                errors.append(f"Question {qid} is unreachable from root")
                
    return {
        "valid": len(errors) == 0,
        "errors": errors
    }
