// This tells Next.js to run this code in the user's browser, not on the server.
'use client';

// Importing the tool that lets us create UI-updating variables (State)
import { useState } from 'react';

// --- TYPESCRIPT BLUEPRINTS ---
// This tells the frontend exactly what the FastAPI JSON will look like.
// The question mark (?) means the field is optional (can be null or undefined).
// --- TYPES (Matching your Python backend) ---
type DrawingMeta = { drawing_no: string; revision: string; line_number: string };

type MTORow = {
  item_no: number; category: string; description: string; size_nps: string;
  schedule_rating?: string; material_spec?: string; end_type?: string;
  quantity?: number; unit: string; length_m?: number; remarks?: string;
};

// NEW: Updated to match the gatekeeper logic
type MTOResponse = { 
  is_valid: boolean; 
  error_message?: string | null;
  drawing_meta?: DrawingMeta | null; 
  items: MTORow[]; 
};

// This is the main function that builds the web page.
export default function Home() {
  
  // --- STATE VARIABLES ---
  // syntax: const [variableName, functionToUpdateVariable] = useState<Type>(InitialValue);
  const [file, setFile] = useState<File | null>(null); // Stores the uploaded PDF/Image
  const [preview, setPreview] = useState<string | null>(null); // Stores the local URL to show the image
  const [loading, setLoading] = useState(false); // True when waiting for Gemini
  const [error, setError] = useState<string | null>(null); // Stores error messages
  const [result, setResult] = useState<MTOResponse | null>(null); // Stores the final JSON table

  // --- FILE HANDLING FUNCTION ---
  // Triggered whenever the user selects a file from their computer
  const handleFileChange = (selectedFile: File | null) => {
    setError(null); // Clear old errors
    setResult(null); // Clear old tables
    
    // If they clicked "Cancel" in the file picker, do nothing
    if (!selectedFile) return; 

    // Validation: 20MB is 20 * 1024 kilobytes * 1024 bytes.
    if (selectedFile.size > 20 * 1024 * 1024) {
      setError("File is too large. Maximum size is 20MB.");
      return;
    }
    
    // Save the file to our state variable
    setFile(selectedFile);
    // URL.createObjectURL creates a temporary local link so we can display the image immediately
    setPreview(URL.createObjectURL(selectedFile)); 
  };

  // --- API SUBMISSION FUNCTION ---
  const handleUpload = async () => {
    if (!file) return;
    
    setLoading(true); // Turns on the loading spinner UI
    setError(null);

    // FormData is the browser's native way to package files for sending over the internet
    const formData = new FormData();
    formData.append("file", file);

    try {
      // Send the POST request to the FastAPI server running on port 8000
      const res = await fetch("http://localhost:8000/api/upload", {
        method: "POST",
        body: formData,
      });

      // If FastAPI returns a 400 or 500 error, throw it so the catch block handles it
      if (!res.ok) throw new Error(await res.text());
      
      // Parse the JSON string into a structured JavaScript object
      const data: MTOResponse = await res.json();

      if (!data.is_valid) {
        setError(data.error_message || "Invalid Image Detected. NOT A PIPING DRAWING")
        return 
      }
      
      // Save the data, which triggers the UI to draw the table
      setResult(data); 

    } catch (err: any) {
      // If the backend crashes, display the error to the user
      setError(err.message || "An error occurred during processing.");
    } finally {
      // Whether it succeeded or failed, turn off the loading spinner
      setLoading(false); 
    }
  };

  // --- HTML UI RENDERING ---
  return (
    // 'className' is how we apply Tailwind CSS styles. 
    // 'min-h-screen' = height 100vh, 'bg-gray-50' = light gray background.
    <main className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      
      <div className="max-w-7xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-3 gap-8 mt-6">
        
        {/* LEFT COLUMN */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h2 className="text-lg font-semibold text-[#003366] mb-4">Upload Drawing</h2>
            
            {/* FILE INPUT */}
            <input 
              type="file" 
              accept=".png,.jpg,.jpeg,.pdf" 
              // 'e.target.files' is the array of files the user selected. We grab the first one [0].
              onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
            />
            
            {/* CONDITIONAL RENDERING */}
            {/* If the 'error' variable is NOT null, it renders the <p> tag. */}
            {error && <p className="text-red-600 text-sm font-medium mb-4">{error}</p>}
            
            {/* BUTTON */}
            <button 
              onClick={handleUpload} 
              // The button is disabled if 'file' is null OR 'loading' is true
              disabled={!file || loading}
              className="w-full bg-[#FF6600] text-white font-bold py-3 rounded-md hover:bg-[#CC5200] disabled:opacity-50"
            >
              {/* Uses a ternary operator (condition ? true : false) to change the text */}
              {loading ? "Processing AI Extraction..." : "Extract MTO"}
            </button>
          </div>

          {/* PREVIEW PANEL */}
          {preview && file && (
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-sm font-semibold text-gray-500 mb-2">Source Document Preview</h3>
              
              {/* Check if the file is a PDF using its type or extension */}
              {file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf') ? (
                <iframe 
                  src={preview} 
                  className="w-full h-[600px] border rounded" 
                  title="PDF Preview"
                />
              ) : (
                <img 
                  src={preview} 
                  alt="Isometric Preview" 
                  className="w-full h-96 object-contain rounded border bg-gray-50" 
                />
              )}
            </div>
          )}
        </div>

        {/* RIGHT COLUMN */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* LOADING SPINNER */}
          {loading && (
            <div className="flex flex-col items-center justify-center h-full pt-20">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#FF6600]"></div>
            </div>
          )}

          {/* THE RESULTS TABLE */}
          {/* Only render this if NOT loading and 'result' actually contains data */}
          {!loading && result && (
            <div className="bg-white rounded-lg shadow-sm p-6">
              
              <h2 className="text-2xl font-bold">{result.drawing_meta?.drawing_no}</h2>
              
              <table className="min-w-full text-left text-sm border-collapse mt-4">
                <thead className="bg-[#003366] text-white">
                  <tr>
                    <th className="p-3">Item</th>
                    <th className="p-3">Category</th>
                    <th className="p-3">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {/* .map() is a loop for arrays in JavaScript. 
                      For every 'item' in the result.items array, it returns an HTML <tr> row. */}
                  {result.items.map((item, idx) => (
                    // In React, list items must have a unique 'key' attribute
                    <tr key={idx} className="border-b border-gray-100">
                      {/* We use curly braces { } to insert the data variables into the HTML */}
                      <td className="p-3 font-medium">{item.item_no}</td>
                      <td className="p-3">{item.category}</td>
                      <td className="p-3">{item.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

            </div>
          )}
        </div>
      </div>
    </main>
  );
}