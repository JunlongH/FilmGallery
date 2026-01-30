/**
 * LUT Library Component
 * Manages LUT files upload, delete, and preview with a modern UI.
 */

import React, { useState, useEffect, useRef } from 'react';
import { Upload, Trash2, FileType } from 'lucide-react';
import { listLuts, uploadLut, deleteLut } from '../../api';

// Helper to format file size
function formatFileSize(bytes) {
  if (bytes === undefined || bytes === null) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// Helper to format date
function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString();
}

// Generate a deterministic gradient based on string hash
function generatePreviewGradient(lutName) {
  const hash = lutName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const hue1 = hash % 360;
  const hue2 = (hash * 2) % 360;
  return `linear-gradient(135deg, hsl(${hue1}, 40%, 20%) 0%, hsl(${(hue1 + hue2) / 2}, 50%, 40%) 50%, hsl(${hue2}, 40%, 60%) 100%)`;
}

export default function LutLibrary() {
  const [luts, setLuts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  // Fetch LUT list
  const fetchLuts = async () => {
    setLoading(true);
    try {
      const data = await listLuts();
      // API might return array or object with luts array
      const list = Array.isArray(data) ? data : (data.luts || []);
      setLuts(list);
    } catch (err) {
      console.error('Failed to load LUTs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLuts();
  }, []);

  // Handle file upload (supports multiple)
  const handleUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    let successCount = 0;
    let errorCount = 0;

    for (const file of Array.from(files)) {
      const ext = file.name.toLowerCase().split('.').pop();
      if (!['cube', '3dl', 'csp', 'lut'].includes(ext)) {
        errorCount++;
        continue;
      }

      try {
        await uploadLut(file);
        successCount++;
      } catch (err) {
        console.error('Upload error:', file.name, err);
        errorCount++;
      }
    }

    if (errorCount > 0) {
      alert(`Upload complete: ${successCount} success, ${errorCount} failed`);
    }

    await fetchLuts();
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Handle delete
  const handleDelete = async (lutName) => {
    const isBuiltIn = lutName.startsWith('FilmGallery_');
    const message = isBuiltIn 
      ? `"${lutName}" is a built-in LUT. Are you sure you want to delete it?`
      : `Are you sure you want to delete "${lutName}"?`;

    if (!window.confirm(message)) return;
    
    try {
      const success = await deleteLut(lutName);
      if (success !== false) { // Assuming API returns truthy on success
        setLuts(prev => prev.filter(l => l.name !== lutName));
      } else {
        alert('Delete failed');
      }
    } catch (err) {
      console.error('Delete error:', err);
      // Optimistic update fallback or refresh
      fetchLuts();
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">LUT Library</h2>
          <p className="text-default-500 text-sm mt-1">
            Manage 3D LUT files (.cube, .3dl, .csp) for film simulation.
          </p>
        </div>
        <div>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleUpload}
            accept=".cube,.3dl,.csp,.lut"
            multiple
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium shadow-sm"
          >
            {uploading ? (
              <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            Upload LUTs
          </button>
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : luts.length === 0 ? (
        <div className="text-center py-24 border border-dashed border-divider rounded-xl bg-content1/30">
          <div className="w-16 h-16 bg-content2 rounded-full flex items-center justify-center mx-auto mb-4">
            <FileType className="w-8 h-8 text-default-400" />
          </div>
          <h3 className="text-lg font-medium">No LUTs found</h3>
          <p className="text-default-500 mt-2 max-w-sm mx-auto">
            Upload .cube, .3dl, or .csp files to add film simulation presets.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {luts.map((lut) => (
            <div 
              key={lut.name} 
              className="group bg-card border border-divider rounded-xl overflow-hidden hover:border-primary/50 hover:shadow-md transition-all duration-300"
            >
              {/* Preview Bar */}
              <div 
                className="h-24 w-full relative"
                style={{ background: generatePreviewGradient(lut.name) }}
              >
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleDelete(lut.name)}
                    className="p-1.5 bg-black/50 text-white rounded-full hover:bg-red-500 transition-colors backdrop-blur-sm"
                    title="Delete LUT"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                {lut.name.startsWith('FilmGallery_') && (
                  <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-black/40 backdrop-blur-md rounded text-[10px] font-medium text-white border border-white/10">
                    BUILT-IN
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h4 className="font-medium text-sm truncate flex-1" title={lut.name}>
                    {lut.name}
                  </h4>
                </div>
                
                <div className="flex items-center gap-3 text-xs text-default-400">
                  <span className="uppercase bg-content2 px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wider">
                    {lut.type || lut.name.split('.').pop()}
                  </span>
                  <span>{formatFileSize(lut.size)}</span>
                </div>
                
                {lut.modifiedAt && (
                   <div className="mt-3 pt-3 border-t border-divider text-[10px] text-default-400">
                     Updated {formatDate(lut.modifiedAt)}
                   </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
