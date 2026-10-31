import json
import logging
from typing import List, Dict, Any, Optional
import httpx
from ..config import settings
from ..guards.budget import record_token_usage

logger = logging.getLogger("interviewsense.llm")

async def complete(
    messages: List[Dict[str, str]],
    max_tokens: int,
    model_tier: str = "followup",
    response_format: Optional[str] = "json"
) -> Dict[str, Any]:
    """
    Sends request to LLM provider (Google Gemini or OpenAI-compatible).
    Model names are pulled from settings/env according to tier.
    Tokens are logged without logging transcripts.
    """
    if model_tier == "report":
        model_name = settings.MODEL_REPORT
    elif model_tier == "bankgen":
        model_name = settings.MODEL_BANKGEN
    else:
        model_name = settings.MODEL_FOLLOWUP

    # 1. Mock Provider for offline development or missing API keys
    if settings.LLM_PROVIDER == "mock" or not settings.api_keys:
        return _mock_complete(messages, model_tier, max_tokens)

    # 2. Google Gemini Provider
    if settings.LLM_PROVIDER == "gemini":
        return await _gemini_complete(messages, model_name, max_tokens, model_tier, response_format)

    # 3. OpenAI or compatible provider
    headers = {
        "Authorization": f"Bearer {settings.LLM_API_KEY}",
        "Content-Type": "application/json"
    }
    
    payload: Dict[str, Any] = {
        "model": model_name,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": 0.3 if model_tier != "bankgen" else 0.4
    }
    
    if response_format == "json":
        payload["response_format"] = {"type": "json_object"}

    async with httpx.AsyncClient(timeout=10.0) as client:
        url = "https://api.openai.com/v1/chat/completions"
        response = await client.post(url, headers=headers, json=payload)
        
        if response.status_code != 200:
            logger.error(f"Provider returned error status {response.status_code}: {response.text}")
            raise RuntimeError(f"Provider error: HTTP {response.status_code}")
            
        data = response.json()
        usage = data.get("usage", {})
        prompt_tokens = usage.get("prompt_tokens", 0)
        completion_tokens = usage.get("completion_tokens", 0)
        
        logger.info(f"LLM Call [{model_tier}]: in={prompt_tokens}, out={completion_tokens}")
        record_token_usage(prompt_tokens, completion_tokens)
        
        content = data["choices"][0]["message"]["content"]
        if response_format == "json":
            try:
                return json.loads(content)
            except Exception:
                return {"text": content}
        return {"text": content}

async def _gemini_complete(
    messages: List[Dict[str, str]],
    model_name: str,
    max_tokens: int,
    model_tier: str,
    response_format: Optional[str]
) -> Dict[str, Any]:
    # Extract system instruction and user/model turns
    system_instruction = ""
    contents = []
    
    for m in messages:
        if m["role"] == "system":
            system_instruction += m["content"] + "\n"
        elif m["role"] == "user":
            contents.append({"role": "user", "parts": [{"text": m["content"]}]})
        elif m["role"] == "assistant":
            contents.append({"role": "model", "parts": [{"text": m["content"]}]})

    generation_config: Dict[str, Any] = {
        "maxOutputTokens": max_tokens,
        "temperature": 0.3 if model_tier != "bankgen" else 0.4,
    }
    if response_format == "json":
        generation_config["responseMimeType"] = "application/json"

    payload: Dict[str, Any] = {
        "contents": contents,
        "generationConfig": generation_config
    }
    if system_instruction.strip():
        payload["systemInstruction"] = {
            "parts": [{"text": system_instruction.strip()}]
        }

    keys = settings.api_keys
    if not keys:
        logger.warning("No Gemini API keys configured, falling back to mock")
        return _mock_complete(messages, model_tier, max_tokens)

    async with httpx.AsyncClient(timeout=10.0) as client:
        for idx, key in enumerate(keys):
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={key}"
            try:
                response = await client.post(url, json=payload)
                if response.status_code == 200:
                    data = response.json()
                    usage = data.get("usageMetadata", {})
                    prompt_tokens = usage.get("promptTokenCount", 0)
                    completion_tokens = usage.get("candidatesTokenCount", 0)

                    logger.info(f"Gemini Call [{model_tier}] (key #{idx+1}): in={prompt_tokens}, out={completion_tokens}")
                    record_token_usage(prompt_tokens, completion_tokens)

                    candidates = data.get("candidates", [])
                    if not candidates or "content" not in candidates[0]:
                        return {}

                    parts = candidates[0]["content"].get("parts", [])
                    text_content = parts[0].get("text", "{}") if parts else "{}"

                    if response_format == "json":
                        try:
                            parsed = json.loads(text_content)
                            if "followup" not in parsed and "question" in parsed:
                                parsed["followup"] = parsed["question"]
                            return parsed
                        except Exception:
                            cleaned = text_content.strip()
                            if cleaned.startswith("```"):
                                cleaned = cleaned.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
                            try:
                                parsed = json.loads(cleaned)
                                if "followup" not in parsed and "question" in parsed:
                                    parsed["followup"] = parsed["question"]
                                return parsed
                            except Exception:
                                return {"followup": text_content}
                    return {"text": text_content}
                else:
                    logger.warning(
                        f"Gemini API key #{idx+1} ({key[:8]}...) returned status {response.status_code}, trying next key: {response.text[:180]}"
                    )
            except Exception as e:
                logger.warning(f"Gemini API key #{idx+1} ({key[:8]}...) connection error: {e}, trying next key")

    logger.warning("All Gemini API keys exhausted or returned errors, falling back gracefully to mock")
    return _mock_complete(messages, model_tier, max_tokens)

def _mock_complete(messages: List[Dict[str, str]], model_tier: str, max_tokens: int) -> Dict[str, Any]:
    """Deterministic mock provider for offline mode and tests."""
    user_msg = next((m["content"] for m in reversed(messages) if m["role"] == "user"), "")
    
    in_tokens = len(user_msg) // 4
    out_tokens = 30
    record_token_usage(in_tokens, out_tokens)
    logger.info(f"Mock LLM Call [{model_tier}]: in={in_tokens}, out={out_tokens}")
    
    if model_tier == "bankgen":
        return {
            "questions": [
                {
                    "id": "q-res-1",
                    "text": "In your recent project, how did you architect the state machine and handle hardware communication errors?",
                    "topic": "project-architecture",
                    "difficulty": 3,
                    "concepts": [
                        { "id": "c-res-fsm", "text": "Structured state transitions with error/recovery states", "weight": 2, "keywords": ["state", "fsm", "error", "recovery"] },
                        { "id": "c-res-timeout", "text": "Guarded timeouts and retry logic for bus transactions", "weight": 2, "keywords": ["timeout", "retry", "guard"] },
                        { "id": "c-res-telemetry", "text": "Logging or fault notification upon unrecoverable failure", "weight": 1, "keywords": ["log", "fault", "notification"] }
                    ],
                    "staticFollowups": {
                        "c-res-fsm": "What state did the system enter if a peripheral stopped responding?"
                    }
                },
                {
                    "id": "q-res-2",
                    "text": "How did you manage real-time task priorities and memory allocation in your embedded controller?",
                    "topic": "system-design",
                    "difficulty": 3,
                    "concepts": [
                        { "id": "c-res-static-mem", "text": "Avoided dynamic heap allocation in favor of static buffers", "weight": 2, "keywords": ["static", "heap", "buffer", "allocation"] },
                        { "id": "c-res-prio", "text": "Prioritized time-critical sensor sampling over telemetry transmission", "weight": 2, "keywords": ["priority", "critical", "sensor", "telemetry"] },
                        { "id": "c-res-stack", "text": "Monitored task stack watermarks to prevent stack overflows", "weight": 1, "keywords": ["watermark", "stack", "overflow"] }
                    ],
                    "staticFollowups": {
                        "c-res-static-mem": "Why did you choose static memory buffers over dynamic malloc calls?"
                    }
                },
                {
                    "id": "q-res-3",
                    "text": "What test strategy did you use to validate firmware stability under edge conditions?",
                    "topic": "testing-verification",
                    "difficulty": 2,
                    "concepts": [
                        { "id": "c-res-hw-loop", "text": "Hardware-in-the-loop or bench testing with fault injection", "weight": 2, "keywords": ["hil", "bench", "fault injection", "hardware"] },
                        { "id": "c-res-stress", "text": "Stress testing boundary conditions and unexpected bus noise", "weight": 2, "keywords": ["stress", "boundary", "noise", "stability"] }
                    ],
                    "staticFollowups": {
                        "c-res-hw-loop": "How did you simulate hardware peripheral failures during testing?"
                    }
                }
            ]
        }
    
    if model_tier == "report":
        return {
            "overall": "The candidate demonstrated solid embedded fundamentals, clearly articulating protocol line semantics and hardware register interactions, with room for improvement in RTOS concurrency edge cases.",
            "strengths": [
                "Clear understanding of synchronous serial protocols (I2C/SPI lines and addressing)",
                "Strong grasp of register-level bitwise operations and volatile qualification",
                "Concise and structured communication style with appropriate pace"
            ],
            "gaps": [
                "Could provide deeper explanations of priority inheritance mechanisms in RTOS deadlocks",
                "DMA cache coherency considerations were only partially detailed",
                "Watchdog servicing safety best practices could be stated more definitively"
            ],
            "advice": [
                "Practice tracing RTOS task preemption sequences under shared mutex contention",
                "Review ARM Cortex cache invalidate and clean operations when configuring DMA channels",
                "Focus on keeping ISR execution times minimal and non-blocking in practical designs"
            ],
            "score_0_100": 84
        }
        
    if "rephrase" in user_msg.lower():
        return {"followup": "Could you explain more specifically the electrical requirements and signal lines of this protocol?"}
        
    if "adjudicate" in user_msg.lower():
        return {"band": "partial", "followup": "Can you specifically clarify the role of the pull-up resistors?"}
        
    return {"followup": "Could you elaborate on why pull-up resistors are required on those lines?"}
