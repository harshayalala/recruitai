# agents/interview_generator.py
# Agent 3: Generates 5-7 targeted interview questions based on candidate profile

import json
import logging
import re
from typing import Any, Dict

from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage, SystemMessage

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are an expert technical interviewer.
Generate smart, targeted interview questions that validate claims and probe weaknesses.
Always respond with VALID JSON only. No markdown."""

QUESTION_PROMPT = """Generate 5-7 interview questions for this candidate.

CANDIDATE: {candidate_name}
ROLE: {job_description_summary}
SCORE: {score}/100
HIRING REC: {hiring_recommendation}

KEY INFO:
- Skills claimed: {skills}
- Experience: {experience_summary}
- Projects: {project_names}
- Weaknesses identified: {weaknesses}
- Inconsistencies: {inconsistencies}
- Suspicious claims: {suspicious_claims}
- Keyword stuffing detected: {keyword_stuffing}

Generate targeted questions. Mix these types:
1. Skill validation (test if they really know what they claim)
2. Project deep-dive (explore their specific projects)
3. Experience verification (clarify timeline or role specifics)
4. Gap analysis (ask about identified weaknesses)
5. Scenario-based (how they handle real problems)
6. Inconsistency probe (if any found, ask about it diplomatically)

Return EXACTLY this JSON:
{{
  "questions": [
    {{
      "question": "Walk me through how you implemented X in your Y project. What was the most challenging part?",
      "type": "Project Deep-Dive",
      "rationale": "Validates authenticity of claimed project experience"
    }},
    ...5-7 total questions...
  ]
}}"""


def interview_generator_node(state: Dict[str, Any], llm: ChatGroq) -> Dict[str, Any]:
    """
    LangGraph node: Generates smart interview questions.
    """
    if state.get("error"):
        return state

    logger.info(f"[InterviewGenerator] Generating questions for: {state.get('candidate_name')}")

    try:
        # Build compact summaries to stay within token limits
        experience_summary = "; ".join([
            f"{e.get('role', '')} at {e.get('company', '')} ({e.get('duration', '')})"
            for e in state.get("experience", [])[:4]
        ])
        project_names = ", ".join([p.get("name", "") for p in state.get("projects", [])[:5]])
        jd_summary = state.get("job_description", "Software engineering role")[:500]

        prompt = QUESTION_PROMPT.format(
            candidate_name=state.get("candidate_name", "Candidate"),
            job_description_summary=jd_summary,
            score=state.get("score", 0),
            hiring_recommendation=state.get("hiring_recommendation", "Maybe"),
            skills=", ".join(state.get("skills", [])[:15]),
            experience_summary=experience_summary or "Not provided",
            project_names=project_names or "None listed",
            weaknesses="; ".join(state.get("weaknesses", [])[:3]),
            inconsistencies="; ".join(state.get("inconsistencies", [])[:2]) or "None found",
            suspicious_claims="; ".join(state.get("suspicious_claims", [])[:2]) or "None",
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
        questions = data.get("questions", [])

        return {
            **state,
            "interview_questions": questions,
            "processing_stage": "questions_generated",
        }

    except json.JSONDecodeError as e:
        logger.error(f"[InterviewGenerator] JSON error: {e}")
        # Fallback: return generic questions rather than crashing
        return {
            **state,
            "interview_questions": [
                {"question": "Tell me about your most challenging project.", "type": "Experience", "rationale": "General assessment"},
                {"question": "How do you approach debugging complex issues?", "type": "Skill Validation", "rationale": "Problem-solving assessment"},
                {"question": "Describe a time you had to learn a new technology quickly.", "type": "Scenario", "rationale": "Adaptability check"},
            ],
            "processing_stage": "questions_generated",
        }
    except Exception as e:
        logger.error(f"[InterviewGenerator] Error: {e}")
        return {**state, "error": str(e), "processing_stage": "error"}
