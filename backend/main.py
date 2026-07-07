import os
import json
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from dotenv import load_dotenv

# --- NEW SDK IMPORTS ---
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
    nps: Optional[str] = None
    material_class: Optional[str] = None
    service: Optional[str] = None

class MTORow(BaseModel):
    item_no: int
    category: str
    description: str
    size_nps: Optional[str] = None
    schedule_rating: Optional[str] = None
    material_spec: Optional[str] = None
    end_type: Optional[str] = None
    quantity: Optional[int] = None
    unit: str
    length_m: Optional[float] = None
    confidence: Optional[float] = None
    remarks: Optional[str] = None

class MTOResponse(BaseModel):
    is_valid: bool
    error_message: Optional[str] = None
    drawing_meta: Optional[DrawingMeta] = None
    items: List[MTORow] = []

# --- AI PIPELINE ---
def extract_mto_with_ai(file_bytes: bytes, mime_type: str) -> MTOResponse:
    try:
        # Initialize the NEW client
        client = genai.Client(api_key=API_KEY)
        
        prompt = """
        You are an expert Piping Design Quality Engineer. Look at the uploaded image.

        STEP 1: VALIDATION & QUALITY CHECK
        Determine if the image is a valid piping isometric drawing. If not, abort and return "is_valid": false with an error message.

        STEP 2: EXTRACTION RULES
        Extract the title block metadata: drawing_no, revision, line_number, nps, material_class, and service.
        Extract the MTO based on these categories: PIPE, FITTING, FLANGE, VALVE, GASKET, BOLT, SUPPORT, WELD, INSTRUMENT.
        
        For each extracted item, calculate a "confidence" score between 0.00 and 1.00 indicating how certain you are of the text/symbol extraction.

        Return ONLY raw JSON matching this structure exactly:
        {
            "is_valid": true,
            "error_message": null,
            "drawing_meta": {
                "drawing_no": "ISO-1501-01",
                "revision": "2",
                "line_number": "6\"-P-1501-A1A-IH",
                "nps": "6\"",
                "material_class": "A1A",
                "service": "Process"
            },
            "items": [
                {
                    "item_no": 1, 
                    "category": "PIPE", 
                    "description": "Pipe, Seamless, BE, ASME B36.10", 
                    "size_nps": "6\"", 
                    "schedule_rating": "SCH 40",
                    "material_spec": "ASTM A106 Gr.B",
                    "end_type": "BW",
                    "quantity": 1, 
                    "unit": "M",
                    "length_m": 12.45,
                    "confidence": 0.92,
                    "remarks": ""
                }
            ]
        }
        """
        
        # NEW SDK GENERATION CALL
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=[
                types.Part.from_bytes(data=file_bytes, mime_type=mime_type),
                prompt
            ],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.1
            )
        )
        return MTOResponse(**json.loads(response.text))
    
    except Exception as e:
        print(f"AI Failed: {e}")
        return MTOResponse(
            is_valid=False,
            error_message=f"AI Extraction Failed: {str(e)}",
            items=[]
        )

# --- ENDPOINT ---
@app.post("/api/upload", response_model=MTOResponse)
async def upload_drawing(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(('.png', '.jpg', '.jpeg', '.pdf')):
        raise HTTPException(status_code=400, detail="Invalid file type.")
        
    file_bytes = await file.read()
    if len(file_bytes) > 20 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large. Max 20MB.")
    
    mime_type = "application/pdf" if file.filename.lower().endswith('.pdf') else "image/jpeg"
    
    if not API_KEY or API_KEY.strip() == "":
        return MTOResponse(
            is_valid=False,
            error_message="Server Configuration Error: Gemini API key is missing from the .env file.",
            items=[]
        )
        
    return extract_mto_with_ai(file_bytes, mime_type)