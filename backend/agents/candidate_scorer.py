# agents/candidate_scorer.py
# Agent 2: Scores candidate 0-100, detects issues, generates strengths/weaknesses

import json
import logging
import re
from typing import Any, Dict

from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage, SystemMessage

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a senior technical recruiter and talent evaluator.
Score candidates objectively and identify red flags.
Always respond with VALID JSON only. No markdown. No explanation."""

SCORING_PROMPT = """Evaluate this candidate for the given job description.

JOB DESCRIPTION:
{job_description}

CANDIDATE PROFILE:
- Name: {candidate_name}
- Skills: {skills}
- Tools: {tools}
- Experience: {experience}
- Education: {education}
- Certifications: {certifications}
- Projects: {projects}
- Achievements: {achievements}
- Resume Quality: {resume_quality}

SCORING RULES:
- skills_match_score: 0-40 (how well skills/tools match JD requirements)
- experience_score: 0-30 (relevance and depth of experience)
- education_score: 0-15 (education fit for role)
- additional_score: 0-15 (achievements, certifications, projects, quality)
- total score = sum of above (0-100)

Also analyze for:
- keyword_stuffing: True if resume lists skills but shows no evidence of using them
- inconsistencies: timeline gaps, role mismatch, company name issues
- suspicious_claims: vague achievements without metrics, implausible experience

Return EXACTLY this JSON:
{{
  "skills_match_score": 35,
  "experience_score": 25,
  "education_score": 12,
  "additional_score": 10,
  "score": 82,
  "strengths": ["Strong Python background", "Relevant ML project experience", ...],
  "weaknesses": ["No cloud certifications", "Short tenure at companies", ...],
  "keyword_stuffing_detected": false,
  "inconsistencies": ["Gap between 2021-2022 unexplained", ...],
  "suspicious_claims": ["Claims 5 years React but graduated 3 years ago", ...],
  "hiring_recommendation": "Strong Hire|Hire|Maybe|No Hire",
  "ats_score": 78,
  "confidence_score": 85,
  "rank_tier": "A|B|C|D"
}}"""


def candidate_scorer_node(state: Dict[str, Any], llm: ChatGroq) -> Dict[str, Any]:
    """
    LangGraph node: Scores candidate and detects red flags.
    """
    if state.get("error"):
        return state

    logger.info(f"[CandidateScorer] Scoring: {state.get('candidate_name', 'unknown')}")

    try:
        prompt = SCORING_PROMPT.format(
            job_description=state.get("job_description", "General software role")[:2000],
            candidate_name=state.get("candidate_name", "Unknown"),
            skills=", ".join(state.get("skills", [])),
            tools=", ".join(state.get("tools", [])),
            experience=json.dumps(state.get("experience", []))[:1500],
            education=json.dumps(state.get("education", [])),
            certifications=", ".join(state.get("certifications", [])),
            projects=json.dumps(state.get("projects", []))[:1000],
            achievements=", ".join(state.get("achievements", [])),
            resume_quality=state.get("resume_quality", "average"),
        )

        messages = [
            SystemMessage(content=SYSTEM_PROMPT),
            HumanMessage(content=prompt),
        ]

        response = llm.invoke(messages)
        raw_text = response.content.strip()
        raw_text = re.sub(r"```json\s*", "", raw_text)
        raw_text = re.sub(r"```\s*", "", raw_text)

        data = json.loads(raw_text)

        # Clamp scores to valid ranges
        def clamp(val, lo, hi):
            return max(lo, min(hi, int(val or 0)))

        skills_score = clamp(data.get("skills_match_score", 0), 0, 40)
        exp_score = clamp(data.get("experience_score", 0), 0, 30)
        edu_score = clamp(data.get("education_score", 0), 0, 15)
        add_score = clamp(data.get("additional_score", 0), 0, 15)
        total = skills_score + exp_score + edu_score + add_score

        return {
            **state,
            "score": total,
            "skills_match_score": skills_score,
            "experience_score": exp_score,
            "education_score": edu_score,
            "additional_score": add_score,
            "strengths": data.get("strengths", []),
            "weaknesses": data.get("weaknesses", []),
            "keyword_stuffing_detected": bool(data.get("keyword_stuffing_detected", False)),
            "inconsistencies": data.get("inconsistencies", []),
            "suspicious_claims": data.get("suspicious_claims", []),
            "hiring_recommendation": data.get("hiring_recommendation", "Maybe"),
            "ats_score": clamp(data.get("ats_score", 50), 0, 100),
            "confidence_score": clamp(data.get("confidence_score", 70), 0, 100),
            "rank_tier": data.get("rank_tier", "C"),
            "processing_stage": "scored",
        }

    except json.JSONDecodeError as e:
        logger.error(f"[CandidateScorer] JSON error: {e}")
        return {**state, "error": f"Scoring JSON failed: {e}", "processing_stage": "error"}
    except Exception as e:
        logger.error(f"[CandidateScorer] Error: {e}")
        return {**state, "error": str(e), "processing_stage": "error"}
