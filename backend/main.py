# main.py
# FastAPI backend — exposes /api/screen-resumes and /api/health

import asyncio
import logging
import os
from typing import List

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger(__name__)

# Validate GROQ_API_KEY early
if not os.environ.get("GROQ_API_KEY"):
    raise EnvironmentError(
        "GROQ_API_KEY not set. Create a .env file with GROQ_API_KEY=your_key"
    )

from utils.pdf_parser import extract_text_from_pdf, get_pdf_metadata
from graph.pipeline import run_pipeline

app = FastAPI(
    title="AI Recruitment System",
    description="Multi-Agent Resume Screening powered by LangGraph + Groq",
    version="1.0.0",
)

# Allow frontend (served from filesystem or different port) to call API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok", "model": "llama-3.3-70b-versatile"}


@app.post("/api/screen-resumes")
async def screen_resumes(
    files: List[UploadFile] = File(...),
    job_description: str = Form(default=""),
):
    """
    Main endpoint: Accept 1-10 PDF resumes + optional job description.
    Runs each resume through the 4-agent LangGraph pipeline concurrently.
    Returns array of candidate results.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded.")

    if len(files) > 10:
        raise HTTPException(status_code=400, detail="Maximum 10 resumes per batch.")

    jd = job_description.strip() or "General software engineering / technology role. Looking for strong technical skills, problem-solving ability, and relevant experience."

    async def process_one(upload: UploadFile) -> dict:
        try:
            file_bytes = await upload.read()

            if not upload.filename.lower().endswith(".pdf"):
                return {
                    "file_name": upload.filename,
                    "error": "Only PDF files are supported.",
                    "candidate_name": upload.filename,
                    "score": 0,
                }

            if len(file_bytes) > 10 * 1024 * 1024:  # 10MB limit
                return {
                    "file_name": upload.filename,
                    "error": "File too large (max 10MB).",
                    "candidate_name": upload.filename,
                    "score": 0,
                }

            # Extract text
            resume_text = extract_text_from_pdf(file_bytes)
            if not resume_text or len(resume_text.strip()) < 100:
                return {
                    "file_name": upload.filename,
                    "error": "Could not extract readable text from PDF.",
                    "candidate_name": upload.filename,
                    "score": 0,
                }

            # Build initial state
            initial_state = {
                "file_name": upload.filename,
                "candidate_name": upload.filename.replace(".pdf", "").replace("_", " ").title(),
                "resume_text": resume_text,
                "job_description": jd,
                # Pre-initialize all fields so TypedDict is happy
                "skills": [],
                "experience": [],
                "education": [],
                "certifications": [],
                "projects": [],
                "tools": [],
                "achievements": [],
                "resume_quality": "average",
                "missing_info": [],
                "raw_analysis": {},
                "score": 0,
                "skills_match_score": 0,
                "experience_score": 0,
                "education_score": 0,
                "additional_score": 0,
                "strengths": [],
                "weaknesses": [],
                "keyword_stuffing_detected": False,
                "inconsistencies": [],
                "suspicious_claims": [],
                "hiring_recommendation": "Maybe",
                "ats_score": 0,
                "confidence_score": 0,
                "interview_questions": [],
                "final_recommendation": "",
                "summary_report": "",
                "improvement_suggestions": [],
                "overall_assessment": "average",
                "rank_tier": "C",
                "error": None,
                "processing_stage": "uploaded",
            }

            # Run the LangGraph pipeline (blocking — run in thread pool)
            loop = asyncio.get_event_loop()
            final_state = await loop.run_in_executor(
                None, lambda: run_pipeline(initial_state)
            )

            # Remove heavy raw text fields before sending to frontend
            result = dict(final_state)
            result.pop("resume_text", None)
            result.pop("raw_analysis", None)

            return result

        except Exception as e:
            logger.error(f"Error processing {upload.filename}: {e}", exc_info=True)
            return {
                "file_name": upload.filename,
                "candidate_name": upload.filename,
                "error": str(e),
                "score": 0,
                "processing_stage": "error",
            }

    # Process all resumes concurrently
    tasks = [process_one(f) for f in files]
    results = await asyncio.gather(*tasks)

    # Sort by score descending
    results_list = list(results)
    results_list.sort(key=lambda x: x.get("score", 0), reverse=True)

    return JSONResponse(content={"candidates": results_list, "total": len(results_list)})


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
