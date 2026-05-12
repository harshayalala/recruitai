# graph/state.py
# Shared state TypedDict that flows through all LangGraph nodes

from typing import TypedDict, Optional, List, Dict, Any


class RecruitmentState(TypedDict):
    """
    Shared state across all 4 agents in the recruitment pipeline.
    Each agent reads and writes to this dict; LangGraph passes it node → node.
    """

    # Input
    candidate_name: str          # Filename / derived name
    resume_text: str             # Raw extracted text from PDF
    job_description: str         # JD provided by recruiter
    file_name: str               # Original upload filename

    # Agent 1 – Resume Analyzer output
    skills: List[str]
    experience: List[Dict[str, Any]]
    education: List[Dict[str, Any]]
    certifications: List[str]
    projects: List[Dict[str, Any]]
    tools: List[str]
    achievements: List[str]
    resume_quality: str          # "excellent" | "good" | "average" | "poor"
    missing_info: List[str]
    raw_analysis: Dict[str, Any]

    # Agent 2 – Candidate Scorer output
    score: int                   # 0-100
    skills_match_score: int      # 0-40
    experience_score: int        # 0-30
    education_score: int         # 0-15
    additional_score: int        # 0-15
    strengths: List[str]
    weaknesses: List[str]
    keyword_stuffing_detected: bool
    inconsistencies: List[str]
    suspicious_claims: List[str]
    hiring_recommendation: str   # "Strong Hire" | "Hire" | "Maybe" | "No Hire"
    ats_score: int               # Simulated ATS score 0-100
    confidence_score: int        # AI confidence 0-100

    # Agent 3 – Interview Questions output
    interview_questions: List[Dict[str, str]]  # [{question, type, rationale}]

    # Agent 4 – Result Finalizer output
    final_recommendation: str
    summary_report: str
    improvement_suggestions: List[str]
    overall_assessment: str
    rank_tier: str               # "A" | "B" | "C" | "D"

    # Meta
    error: Optional[str]
    processing_stage: str
