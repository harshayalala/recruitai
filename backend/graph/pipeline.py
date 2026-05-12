# graph/pipeline.py
# Builds the LangGraph StateGraph with 4 sequential agent nodes

import os
import logging
from functools import partial
from typing import Any, Dict

from langgraph.graph import StateGraph, END
from langchain_groq import ChatGroq

from .state import RecruitmentState
from agents.resume_analyzer import resume_analyzer_node
from agents.candidate_scorer import candidate_scorer_node
from agents.interview_generator import interview_generator_node
from agents.result_finalizer import result_finalizer_node

logger = logging.getLogger(__name__)


def build_pipeline() -> Any:
    """
    Constructs and compiles the multi-agent LangGraph pipeline.

    Graph topology (sequential):
        START → resume_analyzer → candidate_scorer
              → interview_generator → result_finalizer → END
    """
    # Shared LLM instance — Groq Llama-3.3-70B
    llm = ChatGroq(
        model="llama-3.3-70b-versatile",
        api_key=os.environ["GROQ_API_KEY"],
        temperature=0.3,
        max_tokens=4096,
    )

    # Wrap each agent with the shared LLM using partial
    def make_node(fn):
        def node(state: RecruitmentState) -> RecruitmentState:
            return fn(state, llm)
        return node

    # Build StateGraph
    graph = StateGraph(RecruitmentState)

    # Add 4 agent nodes
    graph.add_node("resume_analyzer", make_node(resume_analyzer_node))
    graph.add_node("candidate_scorer", make_node(candidate_scorer_node))
    graph.add_node("interview_generator", make_node(interview_generator_node))
    graph.add_node("result_finalizer", make_node(result_finalizer_node))

    # Sequential edges
    graph.set_entry_point("resume_analyzer")
    graph.add_edge("resume_analyzer", "candidate_scorer")
    graph.add_edge("candidate_scorer", "interview_generator")
    graph.add_edge("interview_generator", "result_finalizer")
    graph.add_edge("result_finalizer", END)

    compiled = graph.compile()
    logger.info("LangGraph pipeline compiled successfully.")
    return compiled


# Singleton pipeline (compiled once on import)
_pipeline = None


def get_pipeline():
    global _pipeline
    if _pipeline is None:
        _pipeline = build_pipeline()
    return _pipeline


def run_pipeline(initial_state: Dict[str, Any]) -> Dict[str, Any]:
    """
    Runs the compiled graph with an initial state dict.
    Plain sync function — called via run_in_executor from async FastAPI handler.
    Returns final state after all 4 agents complete.
    """
    pipeline = get_pipeline()
    final_state = pipeline.invoke(initial_state)
    return final_state
