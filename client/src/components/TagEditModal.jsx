import React, { useState, useEffect, useRef } from 'react';

export default function TagEditModal({ photo, allTags, onClose, onSave }) {
  const [input, setInput] = useState('');
  const [currentTags, setCurrentTags] = useState(photo.tags ? photo.tags.map(t => t.name || t) : []);
  const [suggestions, setSuggestions] = useState([]);
  const inputRef = useRef(null);

  // Theme detection
  const isDark = document.documentElement.classList.contains('dark') || 
                 document.documentElement.getAttribute('data-theme') === 'dark';

  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
  }, []);

  useEffect(() => {
    const lower = input.toLowerCase().trim();
    const filtered = allTags
      .filter(t => t.photos_count > 0) // Hide tags with no photos
      .filter(t => !currentTags.includes(t.name))
      .filter(t => !lower || t.name.toLowerCase().includes(lower));
    setSuggestions(filtered);
  }, [input, allTags, currentTags]);

  const addTag = (name) => {
    if (!name.trim()) return;
    if (currentTags.includes(name.trim())) return;
    setCurrentTags([...currentTags, name.trim()]);
    setInput('');
    // Keep suggestions open or refresh them? 
    // The useEffect will run and remove the added tag from suggestions.
    if (inputRef.current) inputRef.current.focus();
  };

  const removeTag = (name) => {
    setCurrentTags(currentTags.filter(t => t !== name));
  };

  const handleSave = () => {
    let finalTags = [...currentTags];
    if (input.trim() && !finalTags.includes(input.trim())) {
      finalTags.push(input.trim());
    }
    console.log('[TagEditModal] Saving tags:', finalTags, 'for photo:', photo.id);
    onSave(photo.id, finalTags);
    onClose();
  };

  // Theme-aware colors
  const tagBg = isDark ? '#064e3b' : '#eef8ee';
  const tagColor = isDark ? '#34d399' : '#2f7d32';
  const inputBorder = isDark ? '#3f3f46' : '#ccc';
  const inputBg = isDark ? '#27272a' : '#fff';
  const inputColor = isDark ? '#ECEDEE' : '#333';
  const suggestionBg = isDark ? '#27272a' : '#f5f5f5';
  const suggestionBorder = isDark ? '#3f3f46' : '#e0e0e0';
  const suggestionHoverBg = isDark ? '#3f3f46' : '#e8f5e9';
  const suggestionHoverBorder = isDark ? '#52525b' : '#c8e6c9';
  const suggestionTextColor = isDark ? '#ECEDEE' : '#333';
  const cancelBtnBg = isDark ? '#27272a' : '#fff';
  const cancelBtnBorder = isDark ? '#3f3f46' : '#ccc';
  const cancelBtnColor = isDark ? '#ECEDEE' : '#333';

  return (
    <div className="fg-modal-overlay" onClick={onClose}>
      <div className="fg-modal-panel" onClick={e => e.stopPropagation()} style={{ width: 400, maxWidth: '90%' }}>
        <h3 style={{ marginTop: 0, marginBottom: 16, color: isDark ? '#ECEDEE' : '#11181C' }}>Edit Tags</h3>
        
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          {currentTags.map(t => (
            <span key={t} style={{ background: tagBg, color: tagColor, padding: '4px 8px', borderRadius: 16, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
              {t}
              <button onClick={() => removeTag(t)} style={{ border: 'none', background: 'transparent', color: tagColor, cursor: 'pointer', padding: 0, fontSize: 16, lineHeight: 1 }}>×</button>
            </span>
          ))}
        </div>

        <div style={{ position: 'relative', marginBottom: 20 }}>
          <input 
            ref={inputRef}
            value={input} 
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addTag(input);
              }
            }}
            placeholder="Type to add tag..."
            style={{ width: '100%', padding: '8px 12px', borderRadius: 4, border: `1px solid ${inputBorder}`, background: inputBg, color: inputColor }}
          />
          {suggestions.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10, maxHeight: 200, overflowY: 'auto' }}>
              {suggestions.map(s => (
                <div 
                  key={s.id} 
                  onClick={() => addTag(s.name)}
                  style={{ 
                    padding: '6px 12px', 
                    background: suggestionBg, 
                    borderRadius: 20, 
                    cursor: 'pointer', 
                    fontSize: 13, 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 6,
                    border: `1px solid ${suggestionBorder}`,
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = suggestionHoverBg; e.currentTarget.style.borderColor = suggestionHoverBorder; }}
                  onMouseLeave={e => { e.currentTarget.style.background = suggestionBg; e.currentTarget.style.borderColor = suggestionBorder; }}
                >
                  <span style={{ color: suggestionTextColor }}>{s.name}</span>
                  <span style={{ color: tagColor, fontWeight: 'bold', fontSize: 15, lineHeight: 1 }}>+</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button onClick={onClose} style={{ padding: '8px 16px', background: cancelBtnBg, border: `1px solid ${cancelBtnBorder}`, color: cancelBtnColor, borderRadius: 4, cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleSave} style={{ padding: '8px 16px', background: '#2f7d32', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Save</button>
        </div>
      </div>
    </div>
  );
}
