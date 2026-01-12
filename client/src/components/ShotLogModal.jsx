import React, { useState, useEffect } from 'react';
import ModalDialog from './ModalDialog';
import { updateFilmItem, getMetadataOptions, exportShotLogsCsv, getCountries, searchLocations, getCamera, getCompatibleLenses } from '../api';

const FALLBACK_LENSES = [
  '50mm f/1.8',
  '35mm f/1.4',
  '28mm f/2.8',
  '85mm f/1.8',
  '24-70mm f/2.8',
  '70-200mm f/2.8'
];

export default function ShotLogModal({ item, isOpen, onClose, onUpdated }) {
  const [logs, setLogs] = useState([]);
  const [newDate, setNewDate] = useState(new Date().toISOString().split('T')[0]);
  const [newCount, setNewCount] = useState('1');
  const [newLens, setNewLens] = useState('');
  const [newAperture, setNewAperture] = useState('');
  const [newShutter, setNewShutter] = useState('');
  const [newCountry, setNewCountry] = useState('');
  const [newCity, setNewCity] = useState('');
  const [newDetail, setNewDetail] = useState('');
  const [selectedLens, setSelectedLens] = useState('');
  const [lensOptions, setLensOptions] = useState(FALLBACK_LENSES);
  // Inventory-based lens categorization
  const [nativeLenses, setNativeLenses] = useState([]); // [{ id, displayName, ... }]
  const [adaptedLenses, setAdaptedLenses] = useState([]); // [{ id, displayName, mount, ... }]
  const [countries, setCountries] = useState([]);
  const [citiesByCountry, setCitiesByCountry] = useState({}); // code -> cities
  const [countryCode, setCountryCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [exporting, setExporting] = useState(false);
  // Fixed lens camera detection
  const [fixedLensInfo, setFixedLensInfo] = useState(null); // { text, focal_length, max_aperture }
  const [cameraName, setCameraName] = useState('');
  const [cameraMount, setCameraMount] = useState('');

  // Format lens for display
  const formatLensDisplay = (lens) => {
    const name = `${lens.brand || ''} ${lens.model || ''}`.trim();
    if (lens.focal_length_min) {
      const focalStr = lens.focal_length_min === lens.focal_length_max || !lens.focal_length_max
        ? `${lens.focal_length_min}mm`
        : `${lens.focal_length_min}-${lens.focal_length_max}mm`;
      const apertureStr = lens.max_aperture ? ` f/${lens.max_aperture}` : '';
      return name ? `${name} ${focalStr}${apertureStr}` : `${focalStr}${apertureStr}`;
    }
    return name || lens.name || 'Unknown Lens';
  };

  const dedupeAndSort = (list) => Array.from(new Set((list || []).filter(Boolean))).sort((a, b) => a.localeCompare(b));

  const addLensToOptions = (lens) => {
    if (!lens) return;
    setLensOptions((prev) => dedupeAndSort([...prev, lens]));
  };

  useEffect(() => {
    if (item && item.shot_logs) {
      try {
        const parsed = JSON.parse(item.shot_logs);
        if (Array.isArray(parsed)) {
          const normalized = parsed.map(entry => ({
            date: entry.date,
            count: Number(entry.count || entry.shots || 0) || 0,
            lens: entry.lens || '',
            aperture: entry.aperture !== undefined && entry.aperture !== null ? Number(entry.aperture) : null,
            shutter_speed: entry.shutter_speed || '',
            country: entry.country || '',
            city: entry.city || '',
            detail_location: entry.detail_location || ''
          })).filter(e => e.date && e.count > 0);
          setLogs(normalized);
          setLensOptions((prev) => dedupeAndSort([...prev, ...normalized.map(e => e.lens).filter(Boolean)]));
        }
      } catch (e) {
        console.error('Failed to parse shot_logs', e);
      }
    } else {
      setLogs([]);
    }
    if (item && item.shot_logs) {
      const today = new Date().toISOString().split('T')[0];
      setSelectedDate(today);
    }
  }, [item]);

  // Detect fixed lens camera OR fetch compatible lenses for interchangeable lens cameras
  useEffect(() => {
    let mounted = true;
    
    const checkCameraAndLenses = async () => {
      if (!item?.camera_equip_id) {
        setFixedLensInfo(null);
        setCameraName('');
        setCameraMount('');
        setNativeLenses([]);
        setAdaptedLenses([]);
        return;
      }
      
      try {
        // Use getCompatibleLenses which returns camera info + compatible lenses (native + adapted)
        const result = await getCompatibleLenses(item.camera_equip_id);
        if (!mounted) return;
        
        if (result.fixed_lens) {
          // Fixed lens camera
          const lensText = result.focal_length 
            ? `${result.focal_length}mm${result.max_aperture ? ` f/${result.max_aperture}` : ''}`
            : 'Fixed Lens';
          
          setCameraName(result.camera_name || '');
          setCameraMount('');
          setFixedLensInfo({
            text: lensText,
            focal_length: result.focal_length,
            max_aperture: result.max_aperture
          });
          setNativeLenses([]);
          setAdaptedLenses([]);
          
          // Auto-fill lens for new entries
          setSelectedLens(lensText);
          setNewLens('');
        } else {
          // Interchangeable lens camera - store native and adapted lenses separately
          setFixedLensInfo(null);
          setCameraName(result.camera_name || '');
          setCameraMount(result.camera_mount || '');
          
          // Process native lenses
          const native = (result.lenses || []).map(lens => ({
            ...lens,
            displayName: formatLensDisplay(lens)
          }));
          setNativeLenses(native);
          
          // Process adapted lenses (grouped by mount)
          const adapted = (result.adapted_lenses || []).map(lens => ({
            ...lens,
            displayName: formatLensDisplay(lens)
          }));
          setAdaptedLenses(adapted);
          
          // Add to flat lensOptions for backward compatibility (custom input)
          const allLensNames = [...native, ...adapted].map(l => l.displayName).filter(Boolean);
          setLensOptions(prev => dedupeAndSort([...allLensNames, ...prev]));
        }
      } catch (err) {
        console.warn('Failed to fetch camera/lens info', err);
        if (mounted) {
          setFixedLensInfo(null);
          setCameraName('');
          setCameraMount('');
          setNativeLenses([]);
          setAdaptedLenses([]);
        }
      }
    };
    
    checkCameraAndLenses();
    return () => { mounted = false; };
  }, [item?.camera_equip_id]);

  useEffect(() => {
    let mounted = true;
    getMetadataOptions()
      .then((opts) => {
        if (!mounted) return;
        const base = Array.isArray(opts?.lenses) && opts.lenses.length ? opts.lenses : FALLBACK_LENSES;
        // Add to existing options instead of replacing (to preserve compatible lenses)
        setLensOptions(prev => dedupeAndSort([...prev, ...base]));
      })
      .catch(() => setLensOptions(prev => dedupeAndSort([...prev, ...FALLBACK_LENSES])));

    getCountries()
      .then(rows => {
        if (!mounted) return;
        const sorted = (Array.isArray(rows) ? rows : []).sort((a, b) => (a.country_name || '').localeCompare(b.country_name || ''));
        setCountries(sorted);
      })
      .catch(() => setCountries([]));
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    setLensOptions((prev) => dedupeAndSort([...prev, ...logs.map(l => l.lens).filter(Boolean)]));
  }, [logs]);

  useEffect(() => {
    const last = logs[logs.length - 1];
    if (!last) return;
    if (!newCountry) setNewCountry(last.country || '');
    if (!newCity) setNewCity(last.city || '');
    if (!newDetail) setNewDetail(last.detail_location || '');
    if (!newAperture && (last.aperture || last.aperture === 0)) setNewAperture(String(last.aperture));
    if (!newShutter && last.shutter_speed) setNewShutter(last.shutter_speed);
    // derive country code for quick city lookup
    const matched = countries.find(c => (c.country_name || '').toLowerCase() === (last.country || '').toLowerCase());
    if (matched) setCountryCode(matched.country_code);
  }, [logs.length]);

  useEffect(() => {
    const matched = countries.find(c => (c.country_name || '').toLowerCase() === (newCountry || '').toLowerCase());
    const code = matched ? matched.country_code : '';
    setCountryCode(code || '');
    if (code && !citiesByCountry[code]) {
      searchLocations({ country: code }).then(rows => {
        setCitiesByCountry(prev => ({ ...prev, [code]: Array.isArray(rows) ? rows : [] }));
      }).catch(() => {});
    }
  }, [newCountry, countries, citiesByCountry]);

  const handleAdd = () => {
    if (!newDate || !newCount || Number(newCount) <= 0) return;
    // For fixed lens cameras, always use the fixed lens text
    const lensVal = fixedLensInfo ? fixedLensInfo.text : (newLens.trim() || selectedLens || '');
    const last = logs[logs.length - 1] || {};
    const apertureVal = newAperture !== '' ? Number(newAperture) : (last.aperture ?? null);
    const shutterVal = newShutter || last.shutter_speed || '';
    const entry = {
      date: newDate,
      count: Number(newCount),
      lens: lensVal,
      aperture: Number.isFinite(apertureVal) ? apertureVal : null,
      shutter_speed: shutterVal,
      country: newCountry || last.country || '',
      city: newCity || last.city || '',
      detail_location: newDetail || last.detail_location || ''
    };

    const updatedLogs = [...logs, entry].sort((a, b) => a.date.localeCompare(b.date));
    setLogs(updatedLogs);
    if (lensVal) addLensToOptions(lensVal);
    setNewCount('1');
    setNewLens('');
    setNewAperture(apertureVal !== null && apertureVal !== undefined && apertureVal !== '' ? String(apertureVal) : '');
    setNewShutter(shutterVal || '');
    setNewCountry(entry.country || '');
    setNewCity(entry.city || '');
    setNewDetail(entry.detail_location || '');
  };

  const handleRemoveIndex = (index) => {
    const updated = [...logs];
    updated.splice(index, 1);
    setLogs(updated);
  };

  const handleRemoveDate = (date) => {
    setLogs(prev => prev.filter(l => l.date !== date));
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const res = await updateFilmItem(item.id, { shot_logs: JSON.stringify(logs) });
      if (!res.ok) throw new Error(res.error || 'Update failed');

      if (onUpdated) await onUpdated();
      onClose();
    } catch (err) {
      alert('Failed to save logs: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const blob = await exportShotLogsCsv(item.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `shot-logs-${item.id}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Export failed: ' + (err.message || err));
    } finally {
      setExporting(false);
    }
  };

  const totalShots = logs.reduce((acc, cur) => acc + cur.count, 0);
  const uniqueDays = new Set(logs.map(l => l.date)).size;
  const selectedDayLogs = logs.map((entry, idx) => ({ ...entry, idx })).filter(l => l.date === selectedDate);
  const dayEntries = logs
    .map((entry, idx) => ({ ...entry, idx }))
    .filter(entry => selectedDate && entry.date === selectedDate);

  if (!isOpen) return null;

  return (
    <div className="fg-modal-overlay">
      <div className="fg-modal-content" style={{ maxWidth: 1100, width: '94%', background: '#fff', color: '#333', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
        <div className="fg-modal-header" style={{ borderBottom: '1px solid #eee', paddingBottom: 16, marginBottom: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: '#1e293b' }}>Shot Log - {item.label || `Item #${item.id}`}</h3>
            <button
              type="button"
              className="fg-btn fg-btn-sm"
              onClick={handleExport}
              disabled={exporting}
              style={{ background: '#fff', border: '1px solid #e2e8f0', color: '#0f172a', padding: '6px 10px', fontSize: 12 }}
            >
              {exporting ? 'Exporting…' : 'Export CSV'}
            </button>
          </div>
          <button className="fg-modal-close" onClick={onClose} style={{ color: '#64748b' }}>&times;</button>
        </div>
        
        <div className="fg-modal-body" style={{ padding: 24, overflowY: 'auto' }}>
          
          {/* Quick Add Section */}
          <div style={{ marginBottom: 24, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', padding: 20, borderRadius: 12, boxShadow: '0 4px 12px rgba(102, 126, 234, 0.25)' }}>
            {/* Row 1: Date, Count, Aperture, Shutter */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
              <div className="fg-field" style={{ flex: '0 0 140px' }}>
                <label className="fg-label" style={{ color: 'rgba(255,255,255,0.95)', marginBottom: 6, fontSize: 12, fontWeight: 600 }}>Date</label>
                <input 
                  type="date" 
                  className="fg-input" 
                  value={newDate} 
                  onChange={e => setNewDate(e.target.value)} 
                  style={{ background: '#fff', height: 38, border: 'none', fontSize: 13 }}
                />
              </div>
              <div className="fg-field" style={{ flex: '0 0 80px' }}>
                <label className="fg-label" style={{ color: 'rgba(255,255,255,0.95)', marginBottom: 6, fontSize: 12, fontWeight: 600 }}>Shots</label>
                <input 
                  type="number" 
                  className="fg-input" 
                  value={newCount} 
                  onChange={e => setNewCount(e.target.value)} 
                  placeholder="#"
                  min="1"
                  style={{ background: '#fff', height: 38, border: 'none', fontSize: 13 }}
                  onKeyDown={e => e.key === 'Enter' && handleAdd()}
                />
              </div>
              <div className="fg-field" style={{ flex: '0 0 90px' }}>
                <label className="fg-label" style={{ color: 'rgba(255,255,255,0.95)', marginBottom: 6, fontSize: 12, fontWeight: 600 }}>f/</label>
                <input
                  type="number"
                  step="0.1"
                  className="fg-input"
                  value={newAperture}
                  onChange={e => setNewAperture(e.target.value)}
                  placeholder="1.8"
                  style={{ background: '#fff', height: 38, border: 'none', fontSize: 13 }}
                  onKeyDown={e => e.key === 'Enter' && handleAdd()}
                />
              </div>
              <div className="fg-field" style={{ flex: '0 0 100px' }}>
                <label className="fg-label" style={{ color: 'rgba(255,255,255,0.95)', marginBottom: 6, fontSize: 12, fontWeight: 600 }}>s</label>
                <input
                  type="text"
                  className="fg-input"
                  value={newShutter}
                  onChange={e => setNewShutter(e.target.value)}
                  placeholder="1/125"
                  style={{ background: '#fff', height: 38, border: 'none', fontSize: 13 }}
                  onKeyDown={e => e.key === 'Enter' && handleAdd()}
                />
              </div>
              <div className="fg-field" style={{ flex: 1, minWidth: 0 }}>
                <label className="fg-label" style={{ color: 'rgba(255,255,255,0.95)', marginBottom: 6, fontSize: 12, fontWeight: 600 }}>
                  Lens {fixedLensInfo && <span style={{ opacity: 0.7 }}>(Fixed)</span>}
                  {cameraMount && !fixedLensInfo && <span style={{ opacity: 0.6, fontSize: 10, marginLeft: 4 }}>({cameraMount})</span>}
                </label>
                {fixedLensInfo ? (
                  /* Fixed lens camera - show locked indicator */
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 8, 
                    background: '#f0fdf4', 
                    border: '1px solid #86efac', 
                    borderRadius: 6, 
                    padding: '8px 12px',
                    height: 38,
                    boxSizing: 'border-box'
                  }}>
                    <span style={{ fontSize: 14 }}>🔒</span>
                    <span style={{ fontSize: 13, color: '#166534', fontWeight: 500 }}>{fixedLensInfo.text}</span>
                    {cameraName && <span style={{ fontSize: 11, color: '#15803d', marginLeft: 'auto' }}>{cameraName}</span>}
                  </div>
                ) : (
                  /* Inventory lens selection with Native/Adapted categories */
                  <div style={{ display: 'flex', gap: 6 }}>
                    <select
                      className="fg-input"
                      value={selectedLens}
                      onChange={e => setSelectedLens(e.target.value)}
                      style={{ background: '#fff', height: 38, border: 'none', flex: 1, minWidth: 0, fontSize: 13 }}
                    >
                      <option value="">Select lens...</option>
                      {/* Inventory lenses (Native) */}
                      {nativeLenses.length > 0 && (
                        <optgroup label={`📷 Native Lenses${cameraMount ? ` (${cameraMount})` : ''}`}>
                          {nativeLenses.map(l => (
                            <option key={`native-${l.id}`} value={l.displayName}>{l.displayName}</option>
                          ))}
                        </optgroup>
                      )}
                      {/* Inventory lenses (Adapted) */}
                      {adaptedLenses.length > 0 && (
                        <optgroup label="🔄 Adapted Lenses">
                          {adaptedLenses.map(l => (
                            <option key={`adapted-${l.id}`} value={l.displayName}>
                              {l.displayName} [{l.mount}]
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {/* Fallback: show flat options if no inventory lenses */}
                      {nativeLenses.length === 0 && adaptedLenses.length === 0 && lensOptions.length > 0 && (
                        <optgroup label="Other Lenses">
                          {lensOptions.map(l => <option key={l} value={l}>{l}</option>)}
                        </optgroup>
                      )}
                    </select>
                    <input
                      type="text"
                      className="fg-input"
                      value={newLens}
                      onChange={e => setNewLens(e.target.value)}
                      placeholder="Custom"
                      style={{ background: '#fff', height: 38, border: 'none', flex: 1, minWidth: 0, fontSize: 13 }}
                      onKeyDown={e => e.key === 'Enter' && handleAdd()}
                    />
                  </div>
                )}
              </div>
            </div>
            
            {/* Row 2: Country, City, Detail, Add Button */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
              <div className="fg-field" style={{ flex: 1, minWidth: 0 }}>
                <label className="fg-label" style={{ color: 'rgba(255,255,255,0.95)', marginBottom: 6, fontSize: 12, fontWeight: 600 }}>Country</label>
                <input
                  type="text"
                  className="fg-input"
                  list="fg-country-options"
                  value={newCountry}
                  onChange={e => setNewCountry(e.target.value)}
                  placeholder="From DB"
                  style={{ background: '#fff', height: 38, border: 'none', fontSize: 13 }}
                />
                <datalist id="fg-country-options">
                  {countries.map(c => (
                    <option key={c.country_code || c.country_name} value={c.country_name || c.country_code} />
                  ))}
                </datalist>
              </div>
              <div className="fg-field" style={{ flex: 1, minWidth: 0 }}>
                <label className="fg-label" style={{ color: 'rgba(255,255,255,0.95)', marginBottom: 6, fontSize: 12, fontWeight: 600 }}>City</label>
                <input
                  type="text"
                  className="fg-input"
                  list="fg-city-options"
                  value={newCity}
                  onChange={e => setNewCity(e.target.value)}
                  placeholder={countryCode ? 'Filtered' : 'Country first'}
                  disabled={!countryCode && !newCountry}
                  style={{ background: '#fff', height: 38, border: 'none', fontSize: 13 }}
                />
                <datalist id="fg-city-options">
                  {(citiesByCountry[countryCode] || []).map(ct => (
                    <option key={ct.id} value={ct.city_name} />
                  ))}
                </datalist>
              </div>
              <div className="fg-field" style={{ flex: 1.2, minWidth: 0 }}>
                <label className="fg-label" style={{ color: 'rgba(255,255,255,0.95)', marginBottom: 6, fontSize: 12, fontWeight: 600 }}>Detail</label>
                <input
                  type="text"
                  className="fg-input"
                  value={newDetail}
                  onChange={e => setNewDetail(e.target.value)}
                  placeholder="e.g. North Gate"
                  style={{ background: '#fff', height: 38, border: 'none', fontSize: 13 }}
                  onKeyDown={e => e.key === 'Enter' && handleAdd()}
                />
              </div>
              <button 
                type="button" 
                className="fg-btn" 
                onClick={handleAdd}
                disabled={!newCount}
                style={{ height: 38, padding: '0 20px', fontSize: 13, fontWeight: 600, background: '#fff', color: '#667eea', border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.15)', whiteSpace: 'nowrap' }}
              >
                Add Log
              </button>
            </div>
          </div>

          {/* Selected Day Entries (above calendar) */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h4 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#1e293b' }}>Selected Day</h4>
              <span style={{ fontSize: 13, color: '#64748b' }}>{selectedDate || 'Pick a date'}</span>
            </div>
            {selectedDayLogs.length === 0 ? (
              <div style={{ border: '1px dashed #e2e8f0', borderRadius: 8, padding: 12, color: '#94a3b8', fontSize: 13 }}>
                No entries for this day. Click the calendar to choose a date, then add logs above.
              </div>
            ) : (
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 0.6fr 0.5fr 0.7fr 1fr 1fr 1.1fr 80px', background: '#f8fafc', padding: '8px 12px', fontWeight: 600, color: '#475569', fontSize: 13 }}>
                  <div>Date</div>
                  <div>Shots</div>
                  <div>f</div>
                  <div>s</div>
                  <div>Lens</div>
                  <div>Country / City</div>
                  <div>Detail</div>
                  <div></div>
                </div>
                {selectedDayLogs.map((entry) => (
                  <div key={`${entry.date}-${entry.idx}`} style={{ display: 'grid', gridTemplateColumns: '1fr 0.6fr 0.5fr 0.7fr 1fr 1fr 1.1fr 80px', padding: '8px 12px', alignItems: 'center', borderTop: '1px solid #e2e8f0' }}>
                    <div style={{ fontFamily: 'monospace', fontSize: 13 }}>{entry.date}</div>
                    <div style={{ fontSize: 13 }}>{entry.count}</div>
                    <div style={{ fontSize: 13 }}>{entry.aperture || entry.aperture === 0 ? `f${entry.aperture}` : '-'}</div>
                    <div style={{ fontSize: 13 }}>{entry.shutter_speed ? `s${entry.shutter_speed}` : '-'}</div>
                    <div style={{ fontSize: 13 }}>{entry.lens || '-'}</div>
                    <div style={{ fontSize: 13 }}>{[entry.country, entry.city].filter(Boolean).join(' / ') || '-'}</div>
                    <div style={{ fontSize: 13 }}>{entry.detail_location || '-'}</div>
                    <button
                      className="fg-btn"
                      style={{ background: '#fff', border: '1px solid #e2e8f0', color: '#ef4444', padding: '6px 10px' }}
                      onClick={() => {
                        if (window.confirm('Delete this log entry?')) handleRemoveIndex(entry.idx);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Calendar View */}
          <div style={{ marginBottom: 20 }}>
            {/* Month Navigation */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, padding: '0 8px' }}>
              <button
                type="button"
                onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}
                style={{ border: '1px solid #e2e8f0', background: '#fff', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 14, color: '#475569', fontWeight: 500 }}
              >
                ← Prev
              </button>
              <h4 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#1e293b' }}>
                {currentMonth.toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}
              </h4>
              <button
                type="button"
                onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}
                style={{ border: '1px solid #e2e8f0', background: '#fff', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 14, color: '#475569', fontWeight: 500 }}
              >
                Next →
              </button>
            </div>

            {/* Calendar Grid */}
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
              {/* Weekday Headers */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                  <div key={day} style={{ padding: '12px 8px', textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {day}
                  </div>
                ))}
              </div>
              
              {/* Calendar Days */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
                {(() => {
                  const year = currentMonth.getFullYear();
                  const month = currentMonth.getMonth();
                  const firstDay = new Date(year, month, 1).getDay();
                  const daysInMonth = new Date(year, month + 1, 0).getDate();
                  const days = [];
                  
                  // Empty cells before first day
                  for (let i = 0; i < firstDay; i++) {
                    days.push(<div key={`empty-${i}`} style={{ aspectRatio: '1', borderTop: '1px solid #f1f5f9', borderLeft: i > 0 ? '1px solid #f1f5f9' : 'none', background: '#fafafa' }} />);
                  }
                  
                  // Day cells
                  for (let day = 1; day <= daysInMonth; day++) {
                    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const dayLogs = logs.filter(l => l.date === dateStr);
                    const hasLog = dayLogs.length > 0;
                    const isToday = dateStr === new Date().toISOString().split('T')[0];
                    const colIndex = (firstDay + day - 1) % 7;
                    const dayCount = dayLogs.reduce((sum, l) => sum + l.count, 0);
                    const lensLabel = dayLogs.map(l => l.lens).filter(Boolean).join(', ');
                    
                    days.push(
                      <div 
                        key={day}
                        onClick={() => {
                          // Calendar click selects date; per-entry deletion handled below.
                          setNewDate(dateStr);
                          setSelectedDate(dateStr);
                        }}
                        style={{
                          aspectRatio: '1',
                          borderTop: '1px solid #e2e8f0',
                          borderLeft: colIndex > 0 ? '1px solid #e2e8f0' : 'none',
                          padding: 8,
                          cursor: 'pointer',
                          position: 'relative',
                          background: hasLog ? '#eff6ff' : isToday ? '#fef3c7' : '#fff',
                          transition: 'all 0.2s',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between'
                        }}
                        onMouseEnter={e => {
                          if (!hasLog) e.currentTarget.style.background = '#f8fafc';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.background = hasLog ? '#eff6ff' : isToday ? '#fef3c7' : '#fff';
                        }}
                      >
                        <div style={{ fontSize: 13, fontWeight: isToday ? 700 : 500, color: hasLog ? '#2563eb' : isToday ? '#92400e' : '#475569' }}>
                          {day}
                        </div>
                        {hasLog && (
                          <div style={{ 
                            fontSize: 11, 
                            fontWeight: 700, 
                            color: '#fff', 
                            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                            borderRadius: 6,
                            padding: '4px 6px',
                            textAlign: 'center',
                            boxShadow: '0 2px 4px rgba(102, 126, 234, 0.3)'
                          }}>
                            {dayCount} 📸
                          </div>
                        )}
                      </div>
                    );
                  }
                  
                  return days;
                })()}
              </div>
            </div>
          </div>

          {/* Summary Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginTop: 20 }}>
              <div style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', padding: 20, borderRadius: 12, color: '#fff', boxShadow: '0 4px 12px rgba(102, 126, 234, 0.25)' }}>
              <div style={{ fontSize: 13, opacity: 0.9, marginBottom: 4 }}>Total Shots</div>
              <div style={{ fontSize: 32, fontWeight: 700 }}>{totalShots}</div>
            </div>
            <div style={{ background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', padding: 20, borderRadius: 12, color: '#fff', boxShadow: '0 4px 12px rgba(245, 87, 108, 0.25)' }}>
              <div style={{ fontSize: 13, opacity: 0.9, marginBottom: 4 }}>Days Logged</div>
              <div style={{ fontSize: 32, fontWeight: 700 }}>{uniqueDays}</div>
            </div>
          </div>

          {/* Editable List */}
          <div style={{ marginTop: 24 }}>
            <h4 style={{ margin: '0 0 12px', color: '#1e293b' }}>Entries</h4>
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 0.5fr 0.5fr 0.6fr 1fr 1fr 1.1fr 80px', background: '#f8fafc', padding: '10px 12px', fontWeight: 600, color: '#475569', fontSize: 13 }}>
                <div>Date</div>
                <div>Shots</div>
                <div>f</div>
                <div>s</div>
                <div>Lens</div>
                <div>Country / City</div>
                <div>Detail</div>
                <div></div>
              </div>
              {logs.length === 0 && (
                <div style={{ padding: 12, color: '#94a3b8', fontSize: 13 }}>No entries yet.</div>
              )}
              {logs.map((entry, idx) => (
                <div key={`${entry.date}-${idx}`} style={{ display: 'grid', gridTemplateColumns: '1fr 0.5fr 0.5fr 0.6fr 1fr 1fr 1.1fr 80px', padding: '10px 12px', alignItems: 'center', borderTop: '1px solid #e2e8f0' }}>
                  <div style={{ fontFamily: 'monospace', fontSize: 13 }}>{entry.date}</div>
                  <input
                    type="number"
                    className="fg-input"
                    value={entry.count}
                    min="0"
                    onChange={e => {
                      const val = Number(e.target.value) || 0;
                      setLogs(prev => {
                        const next = [...prev];
                        next[idx] = { ...next[idx], count: val };
                        return next;
                      });
                    }}
                    style={{ width: '100%', padding: '6px 8px' }}
                  />
                  <input
                    type="number"
                    step="0.1"
                    className="fg-input"
                    value={entry.aperture ?? ''}
                    placeholder="f"
                    onChange={e => {
                      const val = e.target.value === '' ? null : Number(e.target.value);
                      setLogs(prev => {
                        const next = [...prev];
                        next[idx] = { ...next[idx], aperture: Number.isFinite(val) ? val : null };
                        return next;
                      });
                    }}
                    style={{ width: '100%', padding: '6px 8px' }}
                  />
                  <input
                    type="text"
                    className="fg-input"
                    value={entry.shutter_speed || ''}
                    placeholder="s"
                    onChange={e => {
                      const val = e.target.value;
                      setLogs(prev => {
                        const next = [...prev];
                        next[idx] = { ...next[idx], shutter_speed: val };
                        return next;
                      });
                    }}
                    style={{ width: '100%', padding: '6px 8px' }}
                  />
                  <input
                    type="text"
                    className="fg-input"
                    value={entry.lens || ''}
                    onChange={e => {
                      const val = e.target.value;
                      setLogs(prev => {
                        const next = [...prev];
                        next[idx] = { ...next[idx], lens: val };
                        return next;
                      });
                    }}
                    placeholder="Lens model"
                    style={{ width: '100%', padding: '6px 8px' }}
                  />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      type="text"
                      className="fg-input"
                      value={entry.country || ''}
                      onChange={e => {
                        const val = e.target.value;
                        setLogs(prev => {
                          const next = [...prev];
                          next[idx] = { ...next[idx], country: val };
                          return next;
                        });
                      }}
                      placeholder="Country"
                      style={{ width: '100%', padding: '6px 8px' }}
                    />
                    <input
                      type="text"
                      className="fg-input"
                      value={entry.city || ''}
                      onChange={e => {
                        const val = e.target.value;
                        setLogs(prev => {
                          const next = [...prev];
                          next[idx] = { ...next[idx], city: val };
                          return next;
                        });
                      }}
                      placeholder="City"
                      style={{ width: '100%', padding: '6px 8px' }}
                    />
                  </div>
                  <input
                    type="text"
                    className="fg-input"
                    value={entry.detail_location || ''}
                    onChange={e => {
                      const val = e.target.value;
                      setLogs(prev => {
                        const next = [...prev];
                        next[idx] = { ...next[idx], detail_location: val };
                        return next;
                      });
                    }}
                    placeholder="Detail location"
                    style={{ width: '100%', padding: '6px 8px' }}
                  />
                  <button
                    className="fg-btn"
                    style={{ background: '#fff', border: '1px solid #e2e8f0', color: '#ef4444', padding: '6px 10px' }}
                    onClick={() => {
                      if (window.confirm('Delete this log entry?')) handleRemoveIndex(idx);
                    }}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="fg-modal-footer" style={{ padding: 20, borderTop: '1px solid #eee', display: 'flex', justifyContent: 'flex-end', gap: 12, background: '#fff', borderRadius: '0 0 8px 8px' }}>
          <button 
            type="button" 
            className="fg-btn" 
            onClick={onClose} 
            disabled={loading}
            style={{ background: '#fff', border: '1px solid #cbd5e1', color: '#475569', padding: '8px 20px' }}
          >
            Cancel
          </button>
          <button 
            type="button" 
            className="fg-btn fg-btn-primary" 
            onClick={handleSave} 
            disabled={loading}
            style={{ padding: '8px 24px' }}
          >
            {loading ? 'Saving...' : 'Save Logs'}
          </button>
        </div>
      </div>
    </div>
  );
}
