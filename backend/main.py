import os
import json
import time
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from dotenv import load_dotenv

# --- UPDATED IMPORTS FOR NEW SDK ---
from google import genai
from google.genai import types

load_dotenv()
API_KEY = os.getenv("GEMINI_API_KEY")

app = FastAPI(title="Isometric MTO Generator")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- PYDANTIC MODELS ---
class DrawingMeta(BaseModel):
    drawing_no: str
    revision: str
    line_number: str
    size: Optional[str] = None           # ADDED
    material_class: Optional[str] = None # ADDED

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

# --- MOCK PIPELINE ---
def mock_gemini_extraction() -> MTOResponse:
    print("WARNING: No API key found. Using Mock Pipeline.")
    time.sleep(2)
    return MTOResponse(
        is_valid=True,
        drawing_meta=DrawingMeta(drawing_no="ISO-MOCK-01 (NO API KEY FOUND)", revision="1", line_number="6\"-MOCK-LINE", size="6\"", material_class="A1A"),
        items=[
            MTORow(item_no=1, category="PIPE", description="Seamless Pipe", size_nps="6\"", quantity=None, length_m=12.5, unit="M"),
            MTORow(item_no=2, category="FITTING", description="90 Deg Elbow", size_nps="6\"", quantity=4, unit="EA")
        ]
    )

# --- AI PIPELINE ---
def extract_mto_with_ai(file_bytes: bytes, mime_type: str) -> MTOResponse:
    # --- NEW CLIENT INITIALIZATION ---
    client = genai.Client(api_key=API_KEY)
    
    prompt = """
    You are an expert Piping Design Quality Engineer. Look at the uploaded image.

    STEP 1: VALIDATION & QUALITY CHECK
    Determine if the image is a valid piping isometric drawing. If not, abort and return "is_valid": false with one of these errors:
    - "Error: The uploaded image is not a piping isometric or P&ID drawing."
    - "Error: The image resolution is too low or blurry to accurately read text and symbols."
    - "Error: The drawing lacks clear item numbers (piece marks) required to build an MTO."

    STEP 2: EXTRACTION RULES
    Extract the title block metadata (drawing no, revision, line number, size, material class).
    Extract the MTO based on these categories:
    - PIPE: Straight segments. Unit: 'M' (summed length).
    - FITTING: Elbows, Tees, Reducers, Caps, Olets. Unit: 'EA'.
    - FLANGE: WN, SO, BL, SW. Unit: 'EA'.
    - VALVE: Gate, Globe, Check, Ball, Butterfly. Unit: 'EA'.
    - GASKET: 1 per flanged joint. Unit: 'EA'.
    - BOLT: 1 set per flanged joint. Unit: 'SET'.
    - SUPPORT: Shoes, guides, anchors. Unit: 'EA'.
    - WELD: Butt welds / Field Welds (FW). Unit: 'EA'.
    - INSTRUMENT: Tappings. Unit: 'EA'.

    Standards Vocabulary to use in descriptions:
    - ASME B31.3, ASME B16.9, ASME B16.5, ASME B16.11, ASME B16.20
    - ASTM A106 Gr.B, A234 WPB, A105, A312 TP316L, A182 F316L
    - NPS, SCH 10/40/80/160, STD/XS/XXS

    Return ONLY raw JSON matching this structure exactly:
    {
        "is_valid": true,
        "error_message": null,
        "drawing_meta": {"drawing_no": "...", "revision": "...", "line_number": "...", "size": "...", "material_class": "..."},
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
        # --- NEW SDK GENERATION CALL ---
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=[
                types.Part.from_bytes(data=file_bytes, mime_type=mime_type),
                prompt
            ],
            config=types.GenerateContentConfig(
                response_mime_type="application/json"
            )
        )
        return MTOResponse(**json.loads(response.text))
    except Exception as e:
        print(f"AI Failed: {e}")
        return mock_gemini_extraction()

# --- ENDPOINT ---
@app.post("/api/upload", response_model=MTOResponse)
async def upload_drawing(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(('.png', '.jpg', '.jpeg', '.pdf')):
        raise HTTPException(status_code=400, detail="Invalid file type.")
        
    file_bytes = await file.read()
    if len(file_bytes) > 20 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large. Max 20MB.")
    
    mime_type = "application/pdf" if file.filename.lower().endswith('.pdf') else "image/jpeg"
    
    if API_KEY and API_KEY.strip() != "":
        return extract_mto_with_ai(file_bytes, mime_type)
    return mock_gemini_extraction()