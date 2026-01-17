import React, { useEffect, useState } from 'react';
import LocationInput from './LocationInput.jsx';
import GeoSearchInput from './GeoSearchInput.jsx';
import { getMetadataOptions, API_BASE } from '../api';
import EquipmentSelector from './EquipmentSelector';
import '../styles/forms.css';
import '../styles/sidebar.css';

export default function PhotoDetailsSidebar({ photo, photos, roll, onClose, onSaved }) {
  const isBatch = Array.isArray(photos) && photos.length > 1;
  const base = photo || (isBatch ? photos[0] : null);
  
  const [dateTaken, setDateTaken] = useState(base?.date_taken || '');
  const [timeTaken, setTimeTaken] = useState(base?.time_taken || '');
  const [detailLocation, setDetailLocation] = useState(base?.detail_location || '');
  const [camera, setCamera] = useState(base?.camera || roll?.camera || '');
  const [lens, setLens] = useState(base?.lens || roll?.lens || '');
  const [cameraEquipId, setCameraEquipId] = useState(base?.camera_equip_id || roll?.camera_equip_id || null);
  const [lensEquipId, setLensEquipId] = useState(base?.lens_equip_id || roll?.lens_equip_id || null);
  const [selectedCamera, setSelectedCamera] = useState(null);
  const [photographer, setPhotographer] = useState(base?.photographer || roll?.photographer || '');
  const [aperture, setAperture] = useState(base?.aperture != null ? base.aperture : '');
  const [shutterSpeed, setShutterSpeed] = useState(base?.shutter_speed || '');
  const [iso, setIso] = useState(base?.iso != null ? base.iso : '');
  const [location, setLocation] = useState({
    location_id: base?.location_id || null,
    country_name: base?.country_name || null,
    city_name: base?.city_name || null,
    latitude: base?.latitude,
    longitude: base?.longitude,
  });
  const [scannerEquipId, setScannerEquipId] = useState(base?.scanner_equip_id || roll?.scanner_equip_id || null);
  const [scanResolution, setScanResolution] = useState(base?.scan_resolution || roll?.scan_resolution || '');
  const [scanSoftware, setScanSoftware] = useState(base?.scan_software || roll?.scan_software || '');
  const [scanLab, setScanLab] = useState(base?.scan_lab || roll?.scan_lab || '');
  const [scanDate, setScanDate] = useState(base?.scan_date || roll?.scan_date || '');
  const [scanCost, setScanCost] = useState(base?.scan_cost || roll?.scan_cost || '');
  const [scanNotes, setScanNotes] = useState(base?.scan_notes || roll?.scan_notes || '');
  const [options, setOptions] = useState({ cameras: [], lenses: [], photographers: [] });

  // Load metadata options for autocomplete
  useEffect(() => {
    getMetadataOptions()
      .then(opts => setOptions(opts || { cameras: [], lenses: [], photographers: [] }))
      .catch(err => console.error('Failed to load metadata options', err));
  }, []);

  // Update states when photo changes (for navigation between photos)
  useEffect(() => {
    if (!base) return;
    setDateTaken(base.date_taken || '');
    setTimeTaken(base.time_taken || '');
    setCamera(base.camera || roll?.camera || '');
    setLens(base.lens || roll?.lens || '');
    setCameraEquipId(base.camera_equip_id || roll?.camera_equip_id || null);
    setLensEquipId(base.lens_equip_id || roll?.lens_equip_id || null);
    setPhotographer(base.photographer || roll?.photographer || '');
    setAperture(base.aperture != null ? base.aperture : '');
    setShutterSpeed(base.shutter_speed || '');
    setIso(base.iso != null ? base.iso : '');
    setDetailLocation(base.detail_location || '');
    setLocation({
      location_id: base.location_id || null,
      country_name: base.country_name || null,
      city_name: base.city_name || null,
      latitude: base.latitude,
      longitude: base.longitude,
    });
    setScannerEquipId(base.scanner_equip_id || roll?.scanner_equip_id || null);
    setScanResolution(base.scan_resolution || roll?.scan_resolution || '');
    setScanSoftware(base.scan_software || roll?.scan_software || '');
    setScanLab(base.scan_lab || roll?.scan_lab || '');
    setScanDate(base.scan_date || roll?.scan_date || '');
    setScanCost(base.scan_cost || roll?.scan_cost || '');
    setScanNotes(base.scan_notes || roll?.scan_notes || '');
  }, [base, roll]);

  async function handleSave() {
    const payload = {
      date_taken: dateTaken || null,
      time_taken: timeTaken || null,
      location_id: location.location_id || null,
      country: location.country_name || null,
      city: location.city_name || null,
      detail_location: detailLocation || null,
      latitude: location.latitude ?? null,
      longitude: location.longitude ?? null,
      camera: camera || null,
      lens: lens || null,
      camera_equip_id: cameraEquipId || null,
      lens_equip_id: lensEquipId || null,
      photographer: photographer || null,
      aperture: aperture !== '' ? parseFloat(aperture) : null,
      shutter_speed: shutterSpeed || null,
      iso: iso !== '' ? parseInt(iso) : null,
      scanner_equip_id: scannerEquipId || null,
      scan_resolution: scanResolution || null,
      scan_software: scanSoftware || null,
      scan_lab: scanLab || null,
      scan_date: scanDate || null,
      scan_cost: scanCost || null,
      scan_notes: scanNotes || null
    };
    try {
      const targets = isBatch ? photos : [photo];
      for (const p of targets) {
        await fetch(`${API_BASE}/api/photos/${p.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).then(r=>r.text()).catch(()=>null);
      }

      // Server-side logic now handles roll metadata sync automatically
      onSaved && onSaved(payload);
      onClose && onClose();
    } catch (e) {
      console.error('Batch/Single save failed', e);
      onClose && onClose();
    }
  }

  // focus trap
  const panelRef = React.useRef(null);
  useEffect(()=>{
    const first = panelRef.current?.querySelector('input,select,textarea,button');
    first && first.focus();
    function onKey(e){ if(e.key==='Escape') onClose && onClose(); }
    window.addEventListener('keydown', onKey);
    return ()=> window.removeEventListener('keydown', onKey);
  },[onClose]);

  const [closing, setClosing] = useState(false);
  const handleClose = () => { setClosing(true); setTimeout(()=> onClose && onClose(), 200); };
  return (
    <div role="presentation" onClick={handleClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.25)', zIndex:10019 }}>
    <aside
      ref={panelRef}
      className={`fg-sidepanel ${closing ? 'fade-slide-exit-active' : 'fade-slide-enter-active'}`}
      role="dialog"
      aria-modal="true"
      aria-label={isBatch ? 'Batch edit photos' : 'Photo details'}
      onClick={(e)=> e.stopPropagation()}
    >
      <header className="fg-sidepanel-header">
        <h3 className="fg-sidepanel-title">{isBatch ? `Batch Editing (${photos.length})` : 'Photo Details'}</h3>
        <button className="fg-sidepanel-close" onClick={handleClose} aria-label="Close sidebar">×</button>
      </header>

      <section className="fg-sidepanel-section">
        <div className="fg-section-label">Capture</div>
        <div className="fg-separator" />
        <div className="fg-sidepanel-groupGrid cols-2">
          <div className="fg-field">
            <label className="fg-label">Date Taken</label>
            <input className="fg-input" type="date" lang="en" value={dateTaken} onChange={e=>setDateTaken(e.target.value)} min={roll?.start_date || ''} max={roll?.end_date || ''} />
          </div>
          <div className="fg-field">
            <label className="fg-label">Time Taken</label>
            <input className="fg-input" type="time" value={timeTaken} onChange={e=>setTimeTaken(e.target.value)} />
          </div>
        </div>
        <div className="fg-sidepanel-groupGrid cols-2" style={{ marginTop: 10 }}>
          <div className="fg-field">
            <label className="fg-label">Camera</label>
            <EquipmentSelector 
              type="camera" 
              value={cameraEquipId} 
              onChange={(id, item) => {
                setCameraEquipId(id);
                setSelectedCamera(item);
                setCamera(item ? `${item.brand} ${item.model}` : '');
                // If camera has fixed lens, clear lens selection
                if (item?.has_fixed_lens) {
                  setLensEquipId(null);
                  setLens(item.fixed_lens_focal_length ? `${item.fixed_lens_focal_length}mm f/${item.fixed_lens_max_aperture || '?'}` : 'Fixed');
                }
              }}
              placeholder={roll?.camera ? `Default: ${roll.camera}` : 'Select camera...'}
            />
          </div>
          <div className="fg-field">
            <label className="fg-label">Lens</label>
            {selectedCamera?.has_fixed_lens ? (
              <div className="fg-input" style={{ background: '#f5f5f5', cursor: 'not-allowed', color: '#666', display: 'flex', alignItems: 'center' }}>
                Fixed: {selectedCamera.fixed_lens_focal_length ? `${selectedCamera.fixed_lens_focal_length}mm` : 'Built-in'} 
                {selectedCamera.fixed_lens_max_aperture ? ` f/${selectedCamera.fixed_lens_max_aperture}` : ''}
              </div>
            ) : (
              <EquipmentSelector 
                type="lens" 
                value={lensEquipId} 
                cameraId={cameraEquipId}
                onChange={(id, item) => {
                  setLensEquipId(id);
                  setLens(item ? `${item.brand} ${item.model}` : '');
                }}
                placeholder={roll?.lens ? `Default: ${roll.lens}` : 'Select lens...'}
              />
            )}
          </div>
        </div>
        <div className="fg-sidepanel-groupGrid cols-3" style={{ marginTop: 8 }}>
          <div className="fg-field">
            <label className="fg-label">Aperture</label>
            <input 
              className="fg-input" 
              type="number" 
              step="0.1"
              min="0.5"
              max="64"
              placeholder="e.g. 2.8" 
              value={aperture} 
              onChange={e=>setAperture(e.target.value)} 
            />
          </div>
          <div className="fg-field">
            <label className="fg-label">Shutter</label>
            <input 
              className="fg-input" 
              type="text" 
              placeholder="e.g. 1/125" 
              value={shutterSpeed} 
              onChange={e=>setShutterSpeed(e.target.value)} 
            />
          </div>
          <div className="fg-field">
            <label className="fg-label">ISO</label>
            <input 
              className="fg-input" 
              type="number" 
              min="6"
              max="25600"
              placeholder="e.g. 400" 
              value={iso} 
              onChange={e=>setIso(e.target.value)} 
            />
          </div>
        </div>
        <div className="fg-sidepanel-groupGrid cols-1" style={{ marginTop: 8 }}>
          <div className="fg-field">
            <label className="fg-label">Photographer</label>
            <input 
              className="fg-input" 
              type="text" 
              list="photographer-options"
              placeholder={roll?.photographer ? `Default: ${roll.photographer}` : 'e.g. Xiaoming'} 
              value={photographer} 
              onChange={e=>setPhotographer(e.target.value)} 
            />
            <datalist id="photographer-options">
              {(options.photographers || []).map((p, i) => <option key={i} value={p} />)}
            </datalist>
          </div>
        </div>
      </section>

      <section className="fg-sidepanel-section">
        <div className="fg-section-label">Location</div>
        <div className="fg-separator" />
        <div className="fg-field">
          <label className="fg-label">Country / City</label>
          <LocationInput value={location} onChange={(loc) => {
            if (!loc) {
              setLocation({ location_id: null, country_name: null, city_name: null, latitude: null, longitude: null });
              return;
            }
            setLocation(prev => ({
              location_id: loc.location_id || null,
              country_name: loc.country_name || null,
              city_name: loc.city_name || null,
              latitude: loc.latitude ?? prev.latitude,
              longitude: loc.longitude ?? prev.longitude
            }));
          }} />
        </div>
        <div className="fg-sidepanel-groupGrid cols-2">
          <div className="fg-field">
            <label className="fg-label">Latitude</label>
            <input className="fg-input" type="number" value={location.latitude || ''} onChange={e=>setLocation(l=>({ ...l, latitude: parseFloat(e.target.value) }))} />
          </div>
          <div className="fg-field">
            <label className="fg-label">Longitude</label>
            <input className="fg-input" type="number" value={location.longitude || ''} onChange={e=>setLocation(l=>({ ...l, longitude: parseFloat(e.target.value) }))} />
          </div>
        </div>
        <div className="fg-field">
          <label className="fg-label">Detail Location</label>
          <GeoSearchInput
            value={detailLocation}
            onChange={setDetailLocation}
            onSelect={(result) => {
              // 更新经纬度
              setLocation(l => ({
                ...l,
                latitude: result.latitude,
                longitude: result.longitude
              }));
              // 更新 detail location 文本
              if (result.detail) {
                setDetailLocation(result.detail);
              }
            }}
            placeholder="Search address or type detail..."
          />
        </div>
      </section>

      <section className="fg-sidepanel-section">
        <div className="fg-section-label">Scanning Info</div>
        <div className="fg-separator" />
        <div className="fg-sidepanel-groupGrid cols-2">
          <div className="fg-field">
            <label className="fg-label">Scanner</label>
            <EquipmentSelector 
              type="scanner" 
              value={scannerEquipId} 
              onChange={(id) => setScannerEquipId(id)}
              placeholder="Select scanner..."
            />
          </div>
          <div className="fg-field">
            <label className="fg-label">Scan Lab</label>
            <input className="fg-input" placeholder="e.g. Film Lab, Home scan" value={scanLab} onChange={e=>setScanLab(e.target.value)} />
          </div>
          <div className="fg-field">
            <label className="fg-label">Scan Date</label>
            <input className="fg-input" type="date" value={scanDate} onChange={e=>setScanDate(e.target.value)} lang="en-US" />
          </div>
          <div className="fg-field">
            <label className="fg-label">Resolution (DPI)</label>
            <input className="fg-input" type="number" placeholder="e.g. 3200, 4800" value={scanResolution} onChange={e=>setScanResolution(e.target.value)} />
          </div>
          <div className="fg-field">
            <label className="fg-label">Scan Software</label>
            <input className="fg-input" placeholder="e.g. VueScan, Epson Scan 2" value={scanSoftware} onChange={e=>setScanSoftware(e.target.value)} />
          </div>
          <div className="fg-field">
            <label className="fg-label">Scan Cost</label>
            <input className="fg-input" type="number" placeholder="0.00" value={scanCost} onChange={e=>setScanCost(e.target.value)} />
          </div>
        </div>
        <div className="fg-field" style={{ marginTop: 8 }}>
          <label className="fg-label">Scan Notes</label>
          <textarea className="fg-textarea" style={{ minHeight: 60, resize: 'vertical' }} placeholder="Scan parameters, issues, etc..." value={scanNotes} onChange={e=>setScanNotes(e.target.value)} />
        </div>
      </section>

      <section className="fg-sidepanel-section" style={{ marginTop:'auto' }}>
        <div className="fg-separator" />
        <div className="fg-sidepanel-actions">
          <button type="button" className="fg-btn" onClick={handleClose}>Cancel</button>
          <button type="button" className="fg-btn fg-btn-primary" onClick={handleSave}>Save</button>
        </div>
      </section>
    </aside>
    </div>
  );
}
