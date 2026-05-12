# ⬡ RecruitAI — Multi-Agent Resume Screening System

A production-grade AI recruitment system powered by **LangGraph**, **LangChain**, **Groq (Llama 3.3 70B)**, and **FastAPI** with a premium dark-themed frontend.

---

## 🏗 Architecture

```
PDF Upload → Resume Analyzer → Candidate Scorer → Interview Generator → Result Finalizer → Frontend
```

Four specialized **LangGraph** agents share a single `RecruitmentState` TypedDict:

| # | Agent | Responsibility |
|---|-------|---------------|
| 1 | Resume Analyzer | Extract skills, experience, education, projects, tools |
| 2 | Candidate Scorer | Score 0–100, detect red flags, strengths/weaknesses |
| 3 | Interview Generator | 5–7 targeted interview questions |
| 4 | Result Finalizer | Final report, tier ranking, suggestions |

---

## 📁 Folder Structure

```
project/
├── backend/
│   ├── main.py                 # FastAPI app, /api/screen-resumes
│   ├── .env                    # GROQ_API_KEY (you fill this)
│   ├── requirements.txt
│   ├── graph/
│   │   ├── __init__.py
│   │   ├── state.py            # RecruitmentState TypedDict
│   │   └── pipeline.py         # LangGraph StateGraph builder
│   ├── agents/
│   │   ├── __init__.py
│   │   ├── resume_analyzer.py
│   │   ├── candidate_scorer.py
│   │   ├── interview_generator.py
│   │   └── result_finalizer.py
│   └── utils/
│       ├── __init__.py
│       └── pdf_parser.py       # pdfplumber + PyMuPDF extraction
│
├── frontend/
│   ├── index.html
│   ├── styles.css
│   └── script.js
│
└── README.md
```

---

## ⚡ Quick Setup

### 1. Get a Free Groq API Key

Go to **https://console.groq.com** → Sign up free → Create API Key → Copy it.

### 2. Clone / download this project

```bash
cd project/backend
```

### 3. Create virtual environment

```bash
python -m venv venv

# Mac/Linux:
source venv/bin/activate

# Windows:
venv\Scripts\activate
```

### 4. Install dependencies

```bash
pip install -r requirements.txt
```

### 5. Set your API key

Edit `backend/.env`:

```env
GROQ_API_KEY=gsk_your_actual_key_here
```

### 6. Start the backend

```bash
# From the backend/ directory:
python main.py

# OR with uvicorn directly:
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

You should see:
```
INFO:     Uvicorn running on http://0.0.0.0:8000
```

### 7. Open the frontend

Open `frontend/index.html` directly in your browser.

> **No build step needed** — it's plain HTML/CSS/JS.

---

## 🎯 Usage

1. Open `frontend/index.html`
2. (Optional) Paste a Job Description for better scoring
3. Drag & drop up to 10 PDF resumes into the upload zone
4. Click **Analyze Resumes**
5. Watch the 4-agent pipeline process each resume
6. View results in **Candidates** tab, detailed view in **Leaderboard**
7. Click any candidate card to open the full report modal
8. Export individual reports as **PDF** or all results as **JSON**

---

## 🔌 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/api/health` | Health check |
| `POST` | `/api/screen-resumes` | Upload PDFs + JD, get results |

### POST `/api/screen-resumes`

**Form data:**
- `files` — one or more `.pdf` files (multipart)
- `job_description` — string (optional)

**Response:**
```json
{
  "candidates": [
    {
      "candidate_name": "John Doe",
      "score": 82,
      "hiring_recommendation": "Strong Hire",
      "rank_tier": "A",
      "skills": [...],
      "interview_questions": [...],
      ...
    }
  ],
  "total": 1
}
```

---

## 🧠 Model & Scoring

- **Model:** `llama-3.3-70b-versatile` via Groq API (free tier)
- **Temperature:** 0.3 (consistent, factual outputs)

### Scoring Weights

| Category | Weight |
|----------|--------|
| Skills Match | 40 pts |
| Experience Relevance | 30 pts |
| Education Fit | 15 pts |
| Additional Factors | 15 pts |
| **Total** | **100 pts** |

### Tier Classification

| Tier | Score Range |
|------|------------|
| A | 80–100 |
| B | 60–79 |
| C | 40–59 |
| D | 0–39 |

---

## 🔧 Troubleshooting

**"GROQ_API_KEY not set"**
→ Make sure `backend/.env` exists and contains `GROQ_API_KEY=gsk_...`

**"Could not extract readable text from PDF"**
→ The PDF is scanned/image-based. Use text-selectable PDFs.

**CORS errors in browser**
→ Make sure the backend is running on port 8000. The frontend calls `http://localhost:8000`.

**JSON parse errors from LLM**
→ Rare — the agents include fallback handling. If persistent, check Groq API limits.

**Rate limit from Groq**
→ Free tier has generous limits. If hit, wait a moment and retry.

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| LLM | Llama 3.3 70B via Groq API |
| Agent Orchestration | LangGraph StateGraph |
| LLM Framework | LangChain |
| Backend | FastAPI + Uvicorn |
| PDF Parsing | pdfplumber + PyMuPDF |
| Frontend | HTML5 + CSS3 + Vanilla JS |
| Fonts | Syne + DM Sans (Google Fonts) |

---

## 📄 License

MIT — free to use, modify, and distribute.
