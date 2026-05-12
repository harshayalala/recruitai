# agents/resume_analyzer.py
# Agent 1: Extracts structured info from raw resume text using Groq / Llama-3.3-70B

import json
import logging
import re
from typing import Any, Dict

from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage, SystemMessage

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are an expert resume parser and career analyst.
Your job is to extract structured information from resume text with high accuracy.
Always respond with VALID JSON only. No markdown. No explanation. Just the JSON object."""

ANALYSIS_PROMPT = """Analyze this resume and extract all information.

RESUME TEXT:
{resume_text}

JOB DESCRIPTION:
{job_description}

Return a JSON object with EXACTLY this structure (fill all fields, use empty list [] if not found):
{{
  "candidate_name": "Full name from resume",
  "skills": ["skill1", "skill2", ...],
  "tools": ["tool1", "tool2", ...],
  "experience": [
    {{
      "company": "Company Name",
      "role": "Job Title",
      "duration": "Jan 2022 - Dec 2023",
      "years": 2.0,
      "description": "Brief description of work done"
    }}
  ],
  "education": [
    {{
      "degree": "B.Tech Computer Science",
      "institution": "University Name",
      "year": "2020",
      "gpa": "3.8"
    }}
  ],
  "certifications": ["cert1", "cert2"],
  "projects": [
    {{
      "name": "Project Name",
      "description": "What was built and how",
      "technologies": ["tech1", "tech2"]
    }}
  ],
  "achievements": ["achievement1", "achievement2"],
  "resume_quality": "excellent|good|average|poor",
  "missing_info": ["contact info", "LinkedIn", etc. - list things that should be in a resume but are missing],
  "total_experience_years": 3.5
}}"""


def resume_analyzer_node(state: Dict[str, Any], llm: ChatGroq) -> Dict[str, Any]:
    """
    LangGraph node: Analyzes resume text and populates structured fields in state.
    """
    logger.info(f"[ResumeAnalyzer] Processing: {state.get('file_name', 'unknown')}")

    try:
        prompt = ANALYSIS_PROMPT.format(
            resume_text=state["resume_text"][:8000],  # Token limit safety
            job_description=state.get("job_description", "General software engineering role")[:2000],
        )

        messages = [
            SystemMessage(content=SYSTEM_PROMPT),
            HumanMessage(content=prompt),
        ]

        response = llm.invoke(messages)
        raw_text = response.content.strip()

        # Strip markdown fences if model adds them
        raw_text = re.sub(r"```json\s*", "", raw_text)
        raw_text = re.sub(r"```\s*", "", raw_text)
        raw_text = raw_text.strip()

        data = json.loads(raw_text)

        return {
            **state,
            "candidate_name": data.get("candidate_name") or state.get("file_name", "Unknown"),
            "skills": data.get("skills", []),
            "tools": data.get("tools", []),
            "experience": data.get("experience", []),
            "education": data.get("education", []),
            "certifications": data.get("certifications", []),
            "projects": data.get("projects", []),
            "achievements": data.get("achievements", []),
            "resume_quality": data.get("resume_quality", "average"),
            "missing_info": data.get("missing_info", []),
            "raw_analysis": data,
            "processing_stage": "analyzed",
            "error": None,
        }

    except json.JSONDecodeError as e:
        logger.error(f"[ResumeAnalyzer] JSON parse error: {e}\nRaw: {raw_text[:500]}")
        return {**state, "error": f"Resume analysis JSON parse failed: {e}", "processing_stage": "error"}
    except Exception as e:
        logger.error(f"[ResumeAnalyzer] Unexpected error: {e}")
        return {**state, "error": str(e), "processing_stage": "error"}
