# agents/result_finalizer.py
# Agent 4: Generates final report, ranking, improvement suggestions

import json
import logging
import re
from typing import Any, Dict

from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage, SystemMessage

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a senior HR director writing final candidate evaluation reports.
Be concise, objective, and actionable. Always respond with VALID JSON only. No markdown."""

FINALIZE_PROMPT = """Write a final evaluation report for this candidate.

CANDIDATE: {candidate_name}
OVERALL SCORE: {score}/100
RANK TIER: {rank_tier}
HIRING RECOMMENDATION: {hiring_recommendation}
ATS SCORE: {ats_score}/100
AI CONFIDENCE: {confidence_score}%

STRENGTHS: {strengths}
WEAKNESSES: {weaknesses}
INCONSISTENCIES: {inconsistencies}
RESUME QUALITY: {resume_quality}
KEYWORD STUFFING: {keyword_stuffing}

Return EXACTLY this JSON:
{{
  "final_recommendation": "1-2 sentence hiring decision with justification",
  "summary_report": "3-4 sentence executive summary of this candidate",
  "overall_assessment": "excellent|good|average|below_average",
  "improvement_suggestions": [
    "Add metrics to achievements (e.g., 'Reduced load time by 40%')",
    "Obtain AWS certification to match role requirements",
    ...4-6 concrete suggestions...
  ]
}}"""


def result_finalizer_node(state: Dict[str, Any], llm: ChatGroq) -> Dict[str, Any]:
    """
    LangGraph node: Produces final structured report.
    """
    if state.get("error"):
        # Even on error, return a degraded final state
        return {
            **state,
            "final_recommendation": "Processing error — manual review required.",
            "summary_report": f"Error during processing: {state.get('error', 'Unknown')}",
            "overall_assessment": "below_average",
            "improvement_suggestions": [],
            "processing_stage": "finalized",
        }

    logger.info(f"[ResultFinalizer] Finalizing: {state.get('candidate_name')}")

    try:
        prompt = FINALIZE_PROMPT.format(
            candidate_name=state.get("candidate_name", "Unknown"),
            score=state.get("score", 0),
            rank_tier=state.get("rank_tier", "C"),
            hiring_recommendation=state.get("hiring_recommendation", "Maybe"),
            ats_score=state.get("ats_score", 0),
            confidence_score=state.get("confidence_score", 0),
            strengths="; ".join(state.get("strengths", [])[:5]),
            weaknesses="; ".join(state.get("weaknesses", [])[:5]),
            inconsistencies="; ".join(state.get("inconsistencies", [])[:3]) or "None",
            resume_quality=state.get("resume_quality", "average"),
            keyword_stuffing=state.get("keyword_stuffing_detected", False),
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

        return {
            **state,
            "final_recommendation": data.get("final_recommendation", "See detailed analysis."),
            "summary_report": data.get("summary_report", ""),
            "overall_assessment": data.get("overall_assessment", "average"),
            "improvement_suggestions": data.get("improvement_suggestions", []),
            "processing_stage": "finalized",
        }

    except json.JSONDecodeError as e:
        logger.error(f"[ResultFinalizer] JSON error: {e}")
        return {
            **state,
            "final_recommendation": state.get("hiring_recommendation", "Review manually."),
            "summary_report": f"Candidate scored {state.get('score', 0)}/100.",
            "overall_assessment": "average",
            "improvement_suggestions": ["Review resume formatting", "Add quantified achievements"],
            "processing_stage": "finalized",
        }
    except Exception as e:
        logger.error(f"[ResultFinalizer] Error: {e}")
        return {**state, "error": str(e), "processing_stage": "error"}
