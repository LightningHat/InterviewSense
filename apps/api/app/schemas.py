from typing import List, Optional, Dict, Literal
from pydantic import BaseModel, Field

# Profile extracted from resume
class Project(BaseModel):
    title: str = Field(..., max_length=200)
    summary: str = Field(..., max_length=200)
    tech: List[str] = Field(default_factory=list, max_length=10)

class Profile(BaseModel):
    level: Literal['intern', 'junior', 'mid', 'senior']
    skills: List[str] = Field(default_factory=list, max_length=15)
    domains: List[str] = Field(default_factory=list, max_length=5)
    projects: List[Project] = Field(default_factory=list, max_length=4)

# Scorer Analysis
class AnswerAnalysis(BaseModel):
    coverage: float = Field(..., ge=0.0, le=1.0)
    covered: List[str] = Field(default_factory=list)
    missing: List[str] = Field(default_factory=list)
    offTopic: bool
    wordCount: int
    fillerRate: float
    confidenceHint: float = Field(..., ge=0.0, le=1.0)

# Question Bank
class Concept(BaseModel):
    id: str
    text: str
    weight: float
    keywords: Optional[List[str]] = None

class QuestionNext(BaseModel):
    strong: Optional[str] = None
    partial: Optional[str] = None
    weak: Optional[str] = None

class Question(BaseModel):
    id: str
    text: str = Field(..., max_length=300)
    topic: str
    difficulty: int = Field(..., ge=1, le=5)
    concepts: List[Concept]
    idealAnswer: Optional[str] = None
    staticFollowups: Dict[str, str]
    next: QuestionNext
    origin: Optional[Literal['pool', 'resume']] = None
    skills: Optional[List[str]] = None
    domain: Optional[str] = None
    level: Optional[Literal['intern', 'junior', 'mid', 'senior']] = None

class BankConfig(BaseModel):
    maxQuestions: int = 8
    maxFollowupsPerQuestion: int = 1
    T_cover: float = 0.55
    T_off: float = 0.25

class QuestionBank(BaseModel):
    id: str
    version: int
    title: str
    config: BankConfig = BankConfig()
    questions: List[Question]
    source: Optional[Literal['static', 'generated']] = 'static'
    profileHash: Optional[str] = None

# Delivery Stats
class DeliveryStats(BaseModel):
    wpm: float
    fillerRate: float
    durationMs: float

# Followup Request / Response
class FollowupRequest(BaseModel):
    sessionId: str
    question: str = Field(..., max_length=400)
    answerPoints: str = Field(..., max_length=800)
    missing: List[str] = Field(default_factory=list)
    summary: str = Field(default="", max_length=600)
    mode: Literal['followup', 'rephrase', 'adjudicate', 'summarize']
    rawAnswer: Optional[str] = Field(None, max_length=1000)

class FollowupResponse(BaseModel):
    followup: Optional[str] = None
    band: Optional[Literal['strong', 'partial', 'weak']] = None
    summary: Optional[str] = None

# Report
class TurnReportInput(BaseModel):
    questionId: str
    band: Literal['strong', 'partial', 'weak', 'offtopic', 'skipped']
    covered: List[str]
    missing: List[str]
    delivery: DeliveryStats

class ReportRequest(BaseModel):
    sessionId: str
    turns: List[TurnReportInput]

class ReportResponse(BaseModel):
    overall: str
    strengths: List[str]
    gaps: List[str]
    advice: List[str]
    score_0_100: int = Field(..., ge=0, le=100)

# Bank Generate
class BankGenerateRequest(BaseModel):
    sessionId: str
    profile: Profile
    bankSize: int = Field(default=8, ge=4, le=15)

# API Error
class ErrorDetail(BaseModel):
    code: str
    message: str
    retryable: bool

class ApiErrorResponse(BaseModel):
    error: ErrorDetail

