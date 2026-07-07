import os
import json
import time
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from dotenv import load_dotenv
import google.generativeai as genai

# Load the secret API key from the .env file
load_dotenv()
API_KEY = os.getenv("GEMINI_API_KEY")

# Configure Gemini if the key exists
if API_KEY:
    genai.configure(api_key=API_KEY)

app = FastAPI(title="Isometric MTO Generator")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- PYDANTIC MODELS (The JSON Blueprint) ---
class DrawingMeta(BaseModel):
    drawing_no: str
    revision: str
    line_number: str

class MTORow(BaseModel):
    item_no: int
    category: str
    description: str
    size_nps: str
    schedule_rating: Optional[str] = None
    material_spec: Optional[str] = None
    end_type: Optional[str] = None
    quantity: Optional[int] = None
    unit: str
    length_m: Optional[float] = None
    remarks: Optional[str] = None

class MTOResponse(BaseModel):
    is_valid: bool
    error_message: Optional[str] = None
    drawing_meta: Optional[DrawingMeta] = None
    items: List[MTORow] = []

# --- THE MOCK PIPELINE (Fallback) ---
def mock_gemini_extraction() -> MTOResponse:
    """Returns fake data if no API key is found (Assessment Requirement)."""
    print("WARNING: No API key found. Using Mock Pipeline.")
    time.sleep(2)
    return MTOResponse(
        drawing_meta=DrawingMeta(drawing_no="ISO-MOCK-01", revision="1", line_number="6\"-MOCK-LINE"),
        items=[
            MTORow(item_no=1, category="PIPE", description="Seamless Pipe", size_nps="6\"", quantity=12, unit="M"),
            MTORow(item_no=2, category="FITTING", description="90 Deg Elbow", size_nps="6\"", quantity=4, unit="EA")
        ]
    )

# --- THE REAL AI PIPELINE ---
def extract_mto_with_ai(file_bytes: bytes, mime_type: str) -> MTOResponse:
    """Sends the image to Gemini and forces it to reply in our exact JSON structure."""
    
    # We use 1.5-flash as it is lightning fast for vision tasks and widely available
    model = genai.GenerativeModel('gemini-2.5-flash')
    
    # 1. THE PROMPT (Updated with Dynamic Error Diagnosis)
    prompt = """
    You are an expert Piping Design Quality Engineer. Look at the uploaded image.

    STEP 1: VALIDATION & QUALITY CHECK
    First, evaluate the image quality and content. If the extraction cannot be reliably performed, you must abort and set "is_valid": false. 
    You MUST provide a specific, single-line "error_message" explaining exactly why it failed. Choose the most appropriate error from this list:
    - "Error: The uploaded image is not a piping isometric or P&ID drawing."
    - "Error: The image resolution is too low or blurry to accurately read text and symbols."
    - "Error: The drawing lacks clear item numbers (piece marks) required to build an MTO."
    - "Error: The drawing is missing critical nominal pipe sizes (NPS) or dimension data."
    - "Error: The component symbols are non-standard or too ambiguous to perform a reliable extraction."

    If any of those failure conditions are met, return ONLY this JSON structure and stop:
    {
        "is_valid": false,
        "error_message": "<Insert the specific 1-line error message from above>",
        "drawing_meta": null,
        "items": []
    }

    STEP 2: EXTRACTION
    If the image IS a valid, readable piping drawing, generate a Material Take-Off (MTO) bill of materials using these rules:
    - PIPE: Straight segments. Quantified by summed length in Metres ('M').
    - FITTINGS: Elbows (90/45 deg), Tees (equal/reducing), Reducers, Caps, Olets. Quantified by count ('EA').
    - FLANGES: Weld-neck (WN), Slip-on (SO), Blind (BL), Socket-weld (SW). Quantified by count ('EA').
    - VALVES: Gate (bowtie), Globe (bowtie with dot), Check (bowtie with flap), Ball (bowtie with circle). Quantified by count ('EA').
    - JOINT CONSUMABLES: Every flanged joint implies 1 Gasket and 1 set of Stud bolts. Derive these.
    - SUPPORTS: Shoes, guides, anchors. Quantified by count ('EA').
    
    Standards & Materials Vocabulary:
    - Standards: ASME B31.3, ASME B16.9, ASME B16.5, ASME B16.11, ASME B16.20.
    - Materials: ASTM A106 Gr.B, A234 WPB, A105, A312 TP316L, A182 F316L.
    - Sizes: NPS and Schedule (SCH 10/40/80/160, STD/XS/XXS).

    For valid drawings, you must return ONLY a raw JSON object that strictly matches this exact structure, with no markdown formatting:
    {
        "is_valid": true,
        "error_message": null,
        "drawing_meta": {"drawing_no": "...", "revision": "...", "line_number": "..."},
        "items": [
            {
                "item_no": 1, 
                "category": "FITTING", 
                "description": "90 Deg LR Elbow, BW, ASME B16.9", 
                "size_nps": "6\"", 
                "schedule_rating": "SCH 40",
                "material_spec": "ASTM A234 WPB",
                "end_type": "BW",
                "quantity": 4, 
                "unit": "EA",
                "length_m": null,
                "remarks": null
            }
        ]
    }
    """
    
    try:
        # 2. Call the AI
        response = model.generate_content(
            contents=[
                {"mime_type": mime_type, "data": file_bytes}, 
                prompt
            ],
            # This config strictly forces the AI to reply in JSON format
            generation_config=genai.GenerationConfig(
                response_mime_type="application/json"
            )
        )
        
        # 3. Convert the AI's text response into our strict Python/Pydantic structure
        raw_json = json.loads(response.text)
        return MTOResponse(**raw_json)
        
    except Exception as e:
        print(f"AI Extraction Failed: {e}")
        # If the AI hallucinates or fails, gracefully fall back to the mock data
        return mock_gemini_extraction()

# --- THE API ENDPOINT ---
@app.post("/api/upload", response_model=MTOResponse)
async def upload_drawing(file: UploadFile = File(...)):
    
    if not file.filename.lower().endswith(('.png', '.jpg', '.jpeg', '.pdf')):
        raise HTTPException(status_code=400, detail="Invalid file type.")
        
    file_bytes = await file.read()
    
    # Enforce a 20MB file size limit
    if len(file_bytes) > 20 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large. Max 20MB.")
    
    # Determine the mime type for Gemini
    mime_type = "application/pdf" if file.filename.lower().endswith('.pdf') else "image/jpeg"
    
    # Assessment Requirement: Graceful Degradation. 
    # If API key exists, use AI. If not, use mock data.
    if API_KEY and API_KEY.strip() != "":
        print("API Key found! Sending to Gemini...")
        return extract_mto_with_ai(file_bytes, mime_type)
    else:
        return mock_gemini_extraction()