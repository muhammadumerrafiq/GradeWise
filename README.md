# GradeWise

AI-powered English assignment evaluation platform for teachers.

## Quick Start (Local — No Docker Required)

### Prerequisites
- Python 3.11+
- Node.js 20+
- Gemini API key

### 1. Configure backend
```bash
cd backend
copy .env.example .env
# Edit .env — add your GEMINI_API_KEY
# DATABASE_URL is already set to SQLite — no changes needed
```

### 2. Install Python dependencies
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate        # (Windows)
source .venv/bin/activate     # (Mac/Linux)
pip install -r requirements.txt
```

### 3. Start backend
```bash
uvicorn main:app --reload --port 8000
# Database tables created automatically on first start
```

### 4. Install and start frontend
```bash
cd frontend
npm install
npm run dev
```

### 5. Open GradeWise
Navigate to http://localhost:5173  
Go to Settings → enter Gemini API key → Test Connection


## Workflow

1. Create an assignment with rubric and requirements
2. Upload student submissions (ZIP or individual files)
3. Confirm student names
4. Start evaluation
5. Review results — edit, approve, copy, export

## Architecture

- `frontend/` React 18 + TypeScript + Tailwind CSS + Lucide Icons + TanStack Query
- `backend/` Python FastAPI + SQLAlchemy 2.0 (PostgreSQL / SQLite support)
- `backend/services/`
  - `file_extractor.py`: PDF, DOCX, TXT, ZIP extraction
  - `name_parser.py`: Filename student name detection & confidence scoring
  - `gemini_service.py`: Google Gemini AI evaluation & validation
  - `evaluation_validator.py`: Score and schema validator
  - `export_service.py`: PDF, DOCX, Excel summary & Bulk ZIP generation
  - `progress_tracker.py`: Evaluation batch tracker
