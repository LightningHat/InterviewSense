# InterviewSense

> **Local-First, Ultra-Low-Token AI Voice Interview Practice System**  
> Practice realistic technical interviews with voice interactions, zero raw audio uploads, and intelligent rubric-based evaluation.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Python](https://img.shields.io/badge/Python-3.10%2B-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100%2B-009688.svg)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-19.0-61DAFB.svg)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6.0-646CFF.svg)](https://vitejs.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## 🎯 Overview

Most AI interview tools stream continuous audio directly to cloud LLMs, resulting in high latency, significant token costs, and privacy vulnerabilities.

**InterviewSense** flips this model:
- **Zero Raw Audio Uploads**: Voice Activity Detection (Silero VAD), Speech-to-Text (Whisper), rubric scoring, and Text-to-Speech (TTS) run **entirely in your web browser**.
- **Extreme Token Efficiency**: The main interview loop is governed by a **deterministic Question Graph (DAG)** and local semantic embeddings. Cloud LLMs are only called for short, targeted follow-ups and final evaluation reports, cutting token consumption by over 90%.
- **Client-Side Privacy**: Resumes are parsed locally. PII (phone numbers, emails, addresses, links) is scrubbed client-side; only an anonymized profile of technical skills and projects is sent to tailor question banks.
- **Fail-Safe & Adaptive**: Automatic fallback from WebGPU to WebAssembly, typed-answer mode when microphones are unavailable, and multi-key LLM failover.

---

## 🏗️ Architecture & Data Flow

```mermaid
flowchart TD
    subgraph Browser ["Client Browser (Local-First Execution)"]
        direction TB
        Mic["Microphone Input"] --> VAD["Silero VAD (@ricky0123/vad-web)"]
        VAD --> STT["Whisper STT Worker (@huggingface/transformers)"]
        STT --> Transcript["Local Transcript & Metrics (WPM, Fillers)"]
        Transcript --> Scorer["Local Embeddings Scorer (bge-small-en-v1.5)"]
        
        Resume["Resume (PDF / DOCX)"] --> Parser["Local Parser & PII Anonymizer"]
        Parser --> Profile["Anonymized Tech Profile"]
        
        Engine["State Machine & Router (DAG)"]
        Scorer --> Engine
        Engine --> TTS["Web Speech TTS Adapter with Watchdog"]
        Engine --> IDB[("IndexedDB (Sessions & Turns)")]
    end

    subgraph Backend ["FastAPI Backend (Minimal Token Microservice)"]
        direction TB
        Profile -->|HTTP POST| BankGen["Bank Assembler & Pool Ingestion"]
        Engine -.->|Optional Tier-1 / Adjudicate (60 tokens)| FollowupGen["Follow-up API"]
        Engine -.->|Session Completion| ReportGen["Comprehensive Report Generator"]
        
        FollowupGen --> LLMProvider["LLM Provider (Gemini / OpenAI)"]
        ReportGen --> LLMProvider
        BankGen --> LLMProvider
        
        subgraph Guardrail ["Security & Cost Guards"]
            RateLimit["Rate Limiter (IP-based)"]
            TokenSpend["Token Budget Tracker ($2/day)"]
            PayloadGuard["Payload Size Guard (8KB limit)"]
        end
    end
```

---

## ✨ Key Features

### 1. Local Voice & Audio Pipeline
- **Silero VAD**: Low-latency speech boundary detection running in an AudioWorklet.
- **On-Device Whisper**: Transcribes candidate answers in browser Web Workers using `Xenova/whisper-tiny.en` or `whisper-base.en`.
- **Barge-in Support**: If you interrupt or speak during question playback, the TTS engine automatically halts and begins recording your response.
- **Delivery Metrics**: Automatically calculates speaking pace (Words-Per-Minute) and filler word frequency without sending audio to the cloud.

### 2. Rubric-Based Semantic Scoring
- Questions are evaluated against multi-concept rubrics.
- In-browser embeddings (`bge-small-en-v1.5`) calculate semantic cosine similarity against candidate answers.
- Answers are classified into deterministic performance bands:
  - **Strong** ($\ge 75\%$ coverage): Advances to progressive or challenging questions.
  - **Partial** ($40\% - 74\%$ coverage): Prompts targeted static or Tier-1 follow-ups addressing missing concepts.
  - **Weak** ($< 40\%$ coverage): Routes to foundational questions to reinforce core concepts.
  - **Off-Topic**: Triggers an instant rephrase probe.

### 3. Smart Question Banks & Directed Graphs
- **Seed Banks**: Pre-embedded embedded systems engineering interview bank (I2C, SPI, UART, RTOS scheduling, interrupt handling, volatile keyword, race conditions).
- **Resume Tailoring**: Ingests projects and skills to interleave project-specific inquiries with core engineering fundamentals.
- **DAG Routing**: Question paths follow a validated directed acyclic graph preventing dead ends or infinite loops.

### 4. Enterprise-Grade Guardrails & Reliability
- **Multi-Key Failover**: Automatically cycles through backup API keys if rate limits (`429`) or temporary upstream outages (`503`) occur.
- **Daily Budget Enforcer**: Shuts off external LLM calls if daily spending thresholds are reached, seamlessly degrading to pre-packaged static questions and local evaluations.
- **Payload Guard**: Strict 8KB request payload cap prevents prompt-injection vectors and unexpected overhead.

---

## 📂 Repository Structure

```text
InterviewSense/
├── apps/
│   ├── api/                     # FastAPI backend microservice
│   │   ├── app/
│   │   │   ├── bank/            # Question pool selector & graph assembler
│   │   │   ├── guards/          # Budget, rate-limiting, and session caps
│   │   │   ├── llm/             # Multi-key Gemini / OpenAI provider adapter
│   │   │   ├── routes/          # Health, Followup, Report, and Bank generation
│   │   │   ├── config.py        # Environment settings and key rotators
│   │   │   └── schemas.py       # Pydantic data models
│   │   └── tests/               # Backend security, guard, and endpoint tests
│   └── web/                     # React + Vite + TypeScript PWA
│       ├── src/
│       │   ├── audio/           # Mic capture, VAD controller, Whisper STT worker
│       │   ├── engine/          # State machine, router, and rolling summarizer
│       │   ├── llm/             # WebLLM & Cloud LLM client adapters
│       │   ├── probe/           # WebGPU, memory, and concurrency probe
│       │   ├── resume/          # PDF/DOCX parser and PII anonymizer
│       │   ├── scoring/         # Feature extraction worker, matcher, and rubrics
│       │   ├── store/           # IndexedDB offline session storage
│       │   ├── tts/             # Web Speech synthesis adapter with watchdog
│       │   ├── ui/              # HomeView, InterviewView, and ReportView
│       │   └── config.ts        # Thresholds and model configurations
├── packages/
│   ├── banks/                   # Question banks, tagged pool & DAG validators
│   └── schemas/                 # Shared Zod schemas and TypeScript types
├── package.json                 # Monorepo workspace configuration
└── README.md                    # Project documentation
```

---

## 🚀 Quick Start Guide

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher
- **Python**: v3.10 or v3.11

---

### Step 1: Clone the Repository
```bash
git clone https://github.com/LightningHat/InterviewSense.git
cd InterviewSense
```

### Step 2: Install Dependencies & Build Packages
```bash
# Install root and workspace npm dependencies
npm install

# Build shared schemas and question bank packages
npm run build
```

### Step 3: Configure Backend Environment
Create `apps/api/.env` from the provided example:
```bash
cp .env.example apps/api/.env
```

Configure your LLM keys in `apps/api/.env`:
```env
LLM_PROVIDER=gemini
LLM_API_KEY=your_gemini_api_key_here
LLM_FALLBACK_API_KEYS=your_secondary_gemini_api_key_here
MODEL_FOLLOWUP=gemini-flash-lite-latest
MODEL_REPORT=gemini-flash-lite-latest
MODEL_BANKGEN=gemini-flash-lite-latest

SESSION_SECRET=interviewsense-secret-key-32chars-min-prod!!
ALLOWED_ORIGIN=http://localhost:5173
BUDGET_DAILY_USD=2.0
BUDGET_MONTHLY_USD=30.0
```

### Step 4: Install Python Dependencies
```bash
cd apps/api
pip install -r requirements.txt
# or: pip install fastapi uvicorn httpx pydantic python-dotenv pytest
cd ../..
```

---

### Step 5: Start the Development Servers

**1. Start the FastAPI Backend:**
```bash
# In one terminal:
python -m uvicorn apps.api.app.main:app --host 127.0.0.1 --port 8000 --reload
```

**2. Start the Vite Frontend:**
```bash
# In a second terminal:
npm run dev
```

Visit **`http://localhost:5173`** in your browser.

---

## 🧪 Testing & Validation

The codebase includes comprehensive test suites across the frontend state machine, rubric embeddings, DAG validators, and backend guardrails:

```bash
# Run all unit, golden, and integration tests across monorepo workspaces:
npm test

# Run backend FastAPI guardrail & endpoint tests:
python -m pytest apps/api/tests

# Check production builds for type correctness:
npm run build
```

---

## 🔒 Security & Privacy Architecture

- **Zero Raw Resume Storage**: Resumes are converted to plain text, stripped of emails, phone numbers, and street addresses, and discarded immediately after keyword extraction.
- **No Remote Audio Processing**: Audio buffers never leave the browser. Whisper STT runs purely client-side via ONNX WebAssembly / WebGPU.
- **Strict Guardrails**:
  - Request bodies are strictly capped at 8KB to prevent denial-of-service and injection attacks.
  - Per-IP rate limiting (30 requests per 10-minute window).
  - Session caps limit follow-up calls to 12 per interview.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
