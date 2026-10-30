import json
import sys
from pathlib import Path

# Add apps/api to sys.path so app module is discoverable
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# Force mock provider during automated test suites to avoid consuming external API quota
import os
os.environ["LLM_PROVIDER"] = "mock"

import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.guards.session import session_usage

client = TestClient(app)

def test_health_check():
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "budget" in data
    assert "token" in data
    assert "sessionId" in data

def test_get_seed_bank():
    response = client.get("/api/banks/embedded-v1")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == "embedded-v1"
    assert len(data["questions"]) >= 15

def test_followup_endpoint():
    payload = {
        "sessionId": "test-session-1",
        "question": "Explain I2C bus.",
        "answerPoints": "Mentioned SDA and SCL lines.",
        "missing": ["pull-up resistors"],
        "summary": "Q1 partial.",
        "mode": "followup"
    }
    response = client.post("/api/followup", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "followup" in data
    assert len(data["followup"]) > 0

def test_session_cap_enforcement():
    session_id = "test-session-cap"
    payload = {
        "sessionId": session_id,
        "question": "Explain I2C bus.",
        "answerPoints": "Points",
        "missing": ["Concept"],
        "summary": "",
        "mode": "followup"
    }
    
    # 12 followups allowed by default
    for _ in range(12):
        res = client.post("/api/followup", json=payload)
        assert res.status_code == 200

    # 13th call should exceed session cap
    res = client.post("/api/followup", json=payload)
    assert res.status_code == 429
    assert "session_cap" in res.text

def test_bank_generate_ndjson():
    payload = {
        "sessionId": "test-session-bankgen",
        "profile": {
            "level": "junior",
            "skills": ["c", "rtos", "i2c", "spi"],
            "domains": ["embedded"],
            "projects": [
                {
                    "title": "Sensor Node",
                    "summary": "Low power I2C sensor node using FreeRTOS",
                    "tech": ["C", "FreeRTOS"]
                }
            ]
        },
        "bankSize": 8
    }

    response = client.post("/api/bank/generate", json=payload)
    assert response.status_code == 200
    
    lines = [json.loads(line) for line in response.text.strip().split("\n") if line.strip()]
    assert len(lines) == 2
    assert lines[0]["type"] == "pool_ready"
    assert lines[1]["type"] == "bank_complete"
    
    generated_bank = lines[1]["bank"]
    assert len(generated_bank["questions"]) >= 5
    assert generated_bank["source"] == "generated"

def test_report_endpoint():
    payload = {
        "sessionId": "test-session-report",
        "turns": [
            {
                "questionId": "q1",
                "band": "strong",
                "covered": ["c1", "c2"],
                "missing": [],
                "delivery": { "wpm": 130, "fillerRate": 0.02, "durationMs": 15000 }
            },
            {
                "questionId": "q2",
                "band": "partial",
                "covered": ["c3"],
                "missing": ["c4"],
                "delivery": { "wpm": 125, "fillerRate": 0.04, "durationMs": 18000 }
            }
        ]
    }

    response = client.post("/api/report", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "overall" in data
    assert len(data["strengths"]) > 0
    assert len(data["gaps"]) > 0
    assert len(data["advice"]) > 0
    assert 0 <= data["score_0_100"] <= 100
