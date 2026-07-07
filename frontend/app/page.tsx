'use client';

import { useState, DragEvent } from 'react';

// --- TYPES ---
type DrawingMeta = { drawing_no: string; revision: string; line_number: string; size?: string; material_class?: string; };
type MTORow = {
  item_no: number; category: string; description: string; size_nps: string;
  schedule_rating?: string; material_spec?: string; end_type?: string;
  quantity?: number; unit: string; length_m?: number; remarks?: string;
};
type MTOResponse = { is_valid: boolean; error_message?: string | null; drawing_meta?: DrawingMeta | null; items: MTORow[]; };

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MTOResponse | null>(null);
  const [isDragging, setIsDragging] = useState(false); // New state for drag-and-drop

  // --- FILE HANDLING ---
  const handleFile = (selectedFile: File | null) => {
    setError(null); setResult(null);
    if (!selectedFile) return;

    if (selectedFile.size > 20 * 1024 * 1024) {
      setError("File is too large. Maximum size is 20MB.");
      return;
    }
    
    setFile(selectedFile);
    setPreview(URL.createObjectURL(selectedFile));
  };

  // --- DRAG AND DROP HANDLERS ---
  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  // --- API SUBMISSION ---
  const handleUpload = async () => {
    if (!file) return;
    setLoading(true); setError(null);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("http://localhost:8000/api/upload", { method: "POST", body: formData });
      if (!res.ok) throw new Error(await res.text());
      const data: MTOResponse = await res.json();
      
      if (!data.is_valid) {
        setError(data.error_message || "Invalid image detected.");
        return;
      }
      setResult(data);
    } catch (err: any) {
      setError(err.message || "An error occurred during processing.");
    } finally {
      setLoading(false);
    }
  };

  // --- CSV EXPORT ---
  const exportCSV = () => {
    if (!result) return;
    const headers = ["Item No", "Category", "Description", "Size NPS", "Rating", "Material", "End Type", "Qty", "Unit", "Length (m)", "Remarks"];
    const rows = result.items.map(item => [
      item.item_no, item.category, `"${item.description}"`, item.size_nps, 
      item.schedule_rating || "", item.material_spec || "", item.end_type || "", 
      item.quantity || "", item.unit, item.length_m || "", item.remarks || ""
    ]);
    const csvContent = [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${result.drawing_meta?.drawing_no || 'MTO'}.csv`;
    link.click();
  };

  // --- SUMMARIES ---
  const pipeLength = result?.items.filter(i => i.category === 'PIPE').reduce((acc, curr) => acc + (curr.length_m || 0), 0) || 0;
  const fittingCount = result?.items.filter(i => i.category === 'FITTING').reduce((acc, curr) => acc + (curr.quantity || 0), 0) || 0;
  const flangeCount = result?.items.filter(i => i.category === 'FLANGE').reduce((acc, curr) => acc + (curr.quantity || 0), 0) || 0;
  const valveCount = result?.items.filter(i => i.category === 'VALVE').reduce((acc, curr) => acc + (curr.quantity || 0), 0) || 0;
  const boltGasketCount = result?.items.filter(i => i.category === 'GASKET' || i.category === 'BOLT').reduce((acc, curr) => acc + (curr.quantity || 0), 0) || 0;

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900 font-sans pb-10">
      <header className="bg-[#003366] text-white p-6 shadow-md">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-bold tracking-wider">Nithin <span className="font-light">| Pathnovo Assessment</span></h1>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-3 gap-8 mt-6">
        
        {/* LEFT COLUMN */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h2 className="text-lg font-semibold text-[#003366] mb-4">Upload Drawing</h2>
            
            {/* DRAG AND DROP ZONE */}
            <div 
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer mb-4 transition-colors ${isDragging ? 'border-[#FF6600] bg-orange-50' : 'border-gray-300 hover:border-gray-400'}`}
              onClick={() => document.getElementById('fileUpload')?.click()}
            >
              <p className="text-sm text-gray-600 mb-2">Drag and drop your Isometric (PDF/JPG/PNG) here</p>
              <p className="text-xs text-gray-400">or click to browse (Max 20MB)</p>
              <input 
                id="fileUpload"
                type="file" 
                className="hidden"
                accept=".png,.jpg,.jpeg,.pdf" 
                onChange={(e) => handleFile(e.target.files?.[0] || null)}
              />
            </div>
            
            {file && <p className="text-sm text-green-600 mb-4 font-semibold">Selected: {file.name}</p>}
            {error && <p className="text-red-600 text-sm font-medium mb-4">{error}</p>}
            
            <button 
              onClick={handleUpload} 
              disabled={!file || loading}
              className="w-full bg-[#FF6600] text-white font-bold py-3 rounded-md hover:bg-[#CC5200] disabled:opacity-50 transition-colors"
            >
              {loading ? "Processing AI Extraction..." : "Extract MTO"}
            </button>
          </div>

          {preview && file && (
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-sm font-semibold text-gray-500 mb-2">Source Document Preview</h3>
              {file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf') ? (
                <iframe src={preview} className="w-full h-[600px] border rounded" title="PDF Preview"/>
              ) : (
                <img src={preview} alt="Isometric Preview" className="w-full object-contain rounded border" />
              )}
            </div>
          )}
        </div>

        {/* RIGHT COLUMN */}
        <div className="lg:col-span-2 space-y-6">
          {loading && (
            <div className="flex flex-col items-center justify-center h-full pt-20 text-gray-500 space-y-4">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#FF6600]"></div>
              <p>Gemini Vision AI is analyzing piping symbols...</p>
            </div>
          )}

          {!loading && result && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-[#003366]">{result.drawing_meta?.drawing_no}</h2>
                  <p className="text-sm text-gray-600 mt-1">
                    <span className="font-semibold">Rev:</span> {result.drawing_meta?.revision} | 
                    <span className="font-semibold ml-2">Line:</span> {result.drawing_meta?.line_number} |
                    <span className="font-semibold ml-2">Size:</span> {result.drawing_meta?.size || "N/A"} |
                    <span className="font-semibold ml-2">Class:</span> {result.drawing_meta?.material_class || "N/A"}
                  </p>
                </div>
                <button onClick={exportCSV} className="bg-gray-800 text-white px-4 py-2 rounded shadow hover:bg-gray-700 text-sm font-semibold">
                  Download CSV
                </button>
              </div>

              {/* SUMMARY CHIPS GRID */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
                <div className="bg-gray-50 border-t-4 border-[#003366] p-3 rounded shadow-sm text-center">
                  <p className="text-xs text-gray-500 font-bold uppercase">Pipe Length</p>
                  <p className="text-lg font-bold">{pipeLength.toFixed(1)} M</p>
                </div>
                <div className="bg-gray-50 border-t-4 border-gray-400 p-3 rounded shadow-sm text-center">
                  <p className="text-xs text-gray-500 font-bold uppercase">Fittings</p>
                  <p className="text-lg font-bold">{fittingCount} EA</p>
                </div>
                <div className="bg-gray-50 border-t-4 border-gray-400 p-3 rounded shadow-sm text-center">
                  <p className="text-xs text-gray-500 font-bold uppercase">Flanges</p>
                  <p className="text-lg font-bold">{flangeCount} EA</p>
                </div>
                <div className="bg-gray-50 border-t-4 border-gray-400 p-3 rounded shadow-sm text-center">
                  <p className="text-xs text-gray-500 font-bold uppercase">Valves</p>
                  <p className="text-lg font-bold">{valveCount} EA</p>
                </div>
                <div className="bg-gray-50 border-t-4 border-[#FF6600] p-3 rounded shadow-sm text-center">
                  <p className="text-xs text-gray-500 font-bold uppercase">Bolts/Gaskets</p>
                  <p className="text-lg font-bold">{boltGasketCount} EA</p>
                </div>
              </div>

              {/* TABLE */}
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm border-collapse">
                  <thead className="bg-[#003366] text-white">
                    <tr>
                      <th className="p-3 font-semibold">Item</th>
                      <th className="p-3 font-semibold">Category</th>
                      <th className="p-3 font-semibold">Description</th>
                      <th className="p-3 font-semibold">Size</th>
                      <th className="p-3 font-semibold">Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.items.map((item, idx) => (
                      <tr key={idx} className="hover:bg-gray-50 border-b border-gray-100">
                        <td className="p-3 font-medium">{item.item_no}</td>
                        <td className="p-3"><span className="bg-gray-200 text-gray-700 px-2 py-1 rounded text-xs font-bold">{item.category}</span></td>
                        <td className="p-3">{item.description}</td>
                        <td className="p-3">{item.size_nps}</td>
                        <td className="p-3 font-bold">{item.category === 'PIPE' ? `${item.length_m} M` : `${item.quantity} EA`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

            </div>
          )}
        </div>
      </div>
    </main>
  );
}