# AI-Powered Piping Isometric to Material Take-Off (MTO) Generator

A full-stack web app that reads piping isometric drawings and pulls out Material Take-Off (MTO) data automatically using Vision AI — no more manually counting fittings and flanges off a PDF.

**GitHub Repository:** [git@github.com:Nithin-Karthikeyan/PathNovo_Repo.git](https://github.com/Nithin-Karthikeyan/PathNovo_Repo#)

---

## 📁 Directory Structure

```text
.
├── backend/                    
│   ├── main.py                 # FastAPI Backend
│   ├── requirements.txt
│   └── .env.example
│
├── frontend/                   
│   ├── app/
│   │   ├── page.tsx            # Next.js Frontend
│   │   ├── layout.tsx          
│   │   ├── globals.css
│   │   └── favicon.ico
│   ├── samples/                # Sample isometric drawings for testing
│   ├── package.json
│   └── tsconfig.json
│
└── README.md
```

## ✨ Features

### 1. Frontend (Next.js & Tailwind CSS)

- **Upload:** Drag-and-drop or file-picker for a single PNG, JPG, or PDF. Rejects anything over 20MB client-side, with proper error states and a loading spinner while the AI works.
- **Results view:**
  - Shows the uploaded drawing side-by-side with the extracted data (`<img>` for images, `<iframe>` for PDFs).
  - Summary chips for total pipe length (m), and counts of fittings, flanges, valves, bolt/gasket sets.
  - Full MTO table plus drawing metadata (Drawing No, Revision, Line, Size, Class).
  - One-click CSV export for dropping straight into Excel.
- **Why App Router:** Went with the App Router instead of the old Pages Router since it's where Next.js is headed and it plays nicer with modern React patterns.

### 2. Backend (FastAPI)

- **API:** Single synchronous endpoint (`POST /api/upload`) — takes the file, returns validated MTO JSON. No job queue.
- **Why synchronous:** Gemini 2.5 Flash chews through an isometric PDF in under 10 seconds, so an async job-ID setup would just be extra SQLite/Redis overhead for no real UX gain here.
- **Validation:** 20MB limit and file-type checks enforced server-side too, before anything touches the LLM.
- **Docs:** Swagger UI comes free at `http://localhost:8000/docs`.
- **CORS:** Set up to talk to the Next.js dev server without issues.

### 3. AI Pipeline (Gemini 2.5 Flash)

- Uses `google.generativeai` with the API key pulled from `.env`. The prompt engineering and JSON schema live in `backend/main.py` if you want to see exactly how it's structured.
- Output gets validated through Pydantic models (`DrawingMeta`, `MTORow`) so units and types are normalized before they ever reach the frontend.
- If `GEMINI_API_KEY` is missing or the API call fails, it doesn't just crash — falls back to a clearly labeled mock MTO or a clean error response.

## 🎯 Accuracy — Where It Stands, Where It Could Go

**Right now:** Zero-shot extraction with Gemini 2.5 Flash. It's genuinely good at reading title blocks, tabular data, and clean, well-separated symbols. Where it falls apart: dense, overlapping, hand-drawn, or rotated text — which, let's be honest, is a lot of real-world legacy isometrics.

**Where I'd take it next:**
Gemini's a general-purpose multimodal model, not an object detector — so for production-grade accuracy on messy drawings, a pure LLM approach won't cut it. The real fix is a hybrid pipeline:

1. **Symbol detection** — train a YOLOv8 model (Roboflow makes annotation painless) to bounding-box valves, reducers, flanges, etc.
2. **Text extraction** — run a proper OCR engine (Tesseract or PaddleOCR) to pull the native BOM and piece marks.
3. **Reconciliation** — a lightweight script (or the LLM) cross-checks detected symbols against OCR'd text, which kills most of the hallucination and boosts confidence on the dense drawings.

## 🚀 Local Setup

### You'll need

- Node.js (v18+)
- Python (3.10+)
- A Gemini API key with 2.5 Flash access

### Backend (Ubuntu 22.04 / Linux / macOS)

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install requirements.txt

# set up env vars
cp .env.example .env
# add your GEMINI_API_KEY to .env

# run it
uvicorn main:app --reload
```
Runs on `http://localhost:8000`

### Frontend

```bash
cd frontend
npm install
npm run dev
```
Runs on `http://localhost:3000`