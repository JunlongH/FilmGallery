// src/components/NewRollForm.jsx
import React, { useState, useEffect } from 'react';
import { getFilms, uploadTmpFiles, createRollMultipart, createRollWithTmp, getMetadataOptions } from '../api';
import FilmSelector from './FilmSelector';
import ModalDialog from './ModalDialog';

export default function NewRollForm({ onCreated }) {
  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [camera, setCamera] = useState('');
  const [lens, setLens] = useState('');
  const [shooter, setShooter] = useState('');
  const [filmId, setFilmId] = useState(null);
  const [exposures, setExposures] = useState(''); //数量
  const [notes, setNotes] = useState('');
  const [isNegative, setIsNegative] = useState(false);
  const [files, setFiles] = useState([]); // File[]
  const [previews, setPreviews] = useState([]); // { url, tmpName? }
  const [uploadProgress, setUploadProgress] = useState(null);
  const [films, setFilms] = useState([]);
  const [useTwoStep, setUseTwoStep] = useState(true); // allow both flows
  const [options, setOptions] = useState({ cameras: [], lenses: [], shooters: [] });
  const [dialog, setDialog] = useState({ isOpen: false, title: '', message: '' });

  const showAlert = (title, message) => {
    setDialog({ isOpen: true, type: 'alert', title, message, onConfirm: () => setDialog(prev => ({ ...prev, isOpen: false })) });
  };

  useEffect(() => { 
    getFilms().then(f => setFilms(f || [])); 
    getMetadataOptions().then(o => setOptions(o || { cameras: [], lenses: [], shooters: [] }));
  }, []);

  // create object URL previews
  useEffect(() => {
    const urls = files.map(f => ({ url: URL.createObjectURL(f), name: f.name }));
    setPreviews(urls);
    return () => urls.forEach(u => URL.revokeObjectURL(u.url));
  }, [files]);

  function onFileChange(e) {
    const list = Array.from(e.target.files || []);
    setFiles(list);
  }

  async function handleTwoStepUpload() {
    if (!files.length) throw new Error('No files selected');
    setUploadProgress(0);
    const res = await uploadTmpFiles(files, p => setUploadProgress(p));
    setUploadProgress(null);
    // res.files => [{ tmpName, url }]
    setPreviews(res.files.map(f => ({ url: f.url, tmpName: f.tmpName, originalName: f.originalName })));
    return res.files;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      console.log('[NewRollForm] Submitting with isNegative:', isNegative);
      if (useTwoStep) {
        // step1: upload tmp
        const uploaded = await handleTwoStepUpload();
        // step2: create roll with tmpFiles array
        if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
          showAlert('Invalid Date', 'Start date cannot be later than end date');
          return;
        }
        const tmpFiles = uploaded.map(f => ({ tmpName: f.tmpName, isNegative }));
        const res = await createRollWithTmp({
          fields: {
            title, start_date: startDate || null, end_date: endDate || null, camera, lens, shooter, filmId, film_type: null, exposures, notes, isNegative 
          },
          tmpFiles
        });
        if (res && res.ok) {
          setFiles([]); setPreviews([]);
          onCreated && onCreated(res.roll);
        } else {
          showAlert('Error', 'Create roll failed: ' + (res && res.error));
        }
      } else {
        // single-step: send multipart with files
        if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
          showAlert('Invalid Date', 'Start date cannot be later than end date');
          return;
        }
        const res = await createRollMultipart({
          fields: { title, start_date: startDate || null, end_date: endDate || null, camera, lens, shooter, filmId, exposures, notes, isNegative },
          files,
          onProgress: p => setUploadProgress(p)
        });
        setUploadProgress(null);
        if (res && res.ok) {
          setFiles([]); setPreviews([]);
          onCreated && onCreated(res.roll);
        } else {
          showAlert('Error', 'Create roll failed');
        }
      }
    } catch (err) {
      setUploadProgress(null);
      console.error(err);
      showAlert('Error', 'Upload error: ' + (err.message || err));
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 600 }}>
      <ModalDialog 
        isOpen={dialog.isOpen} 
        type={dialog.type} 
        title={dialog.title} 
        message={dialog.message} 
        onConfirm={dialog.onConfirm} 
      />
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <label>Title</label>
          <input value={title} onChange={e => setTitle(e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <label>Film</label>
          <FilmSelector films={films} value={filmId} onChange={setFilmId} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <label>Start Date</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <label>End Date</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <label>Camera</label>
          <input list="camera-options" value={camera} onChange={e => setCamera(e.target.value)} placeholder="Select or type..." />
          <datalist id="camera-options">
            {options.cameras.map((c, i) => <option key={i} value={c} />)}
          </datalist>
        </div>
        <div style={{ flex: 1 }}>
          <label>Lens</label>
          <input list="lens-options" value={lens} onChange={e => setLens(e.target.value)} placeholder="Select or type..." />
          <datalist id="lens-options">
            {options.lenses.map((l, i) => <option key={i} value={l} />)}
          </datalist>
        </div>
        <div style={{ flex: 1 }}>
          <label>Shooter</label>
          <input list="shooter-options" value={shooter} onChange={e => setShooter(e.target.value)} placeholder="Select or type..." />
          <datalist id="shooter-options">
            {options.shooters.map((s, i) => <option key={i} value={s} />)}
          </datalist>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <label>Exposures</label>
          <input value={exposures} onChange={e=>setExposures(e.target.value)} />
        </div>
      </div>
      <div>
        <label>Notes</label>
        <textarea value={notes} onChange={e=>setNotes(e.target.value)} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
        <input 
          type="checkbox" 
          id="chk-negative" 
          checked={isNegative} 
          onChange={e => setIsNegative(e.target.checked)} 
          style={{ width: 'auto', margin: 0 }}
        />
        <label htmlFor="chk-negative" style={{ margin: 0, cursor: 'pointer' }}>Import as Negative (Auto-invert later)</label>
      </div>

      <div>
        <label>Files (multiple)</label>
        <input type="file" accept="image/*" multiple onChange={onFileChange} />
      </div>

      <div style={{ marginTop: 8 }}>
        <label>
          <input type="checkbox" checked={useTwoStep} onChange={e=>setUseTwoStep(e.target.checked)} />
          Use two-step upload (upload previews first)
        </label>
      </div>

      <div style={{ marginTop: 12 }}>
        {previews.length ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {previews.map((p, i) => (
              <div key={i} style={{ width: 120, height: 160, border: '1px solid #ddd', padding: 4 }}>
                <img src={p.url} alt={p.name || p.originalName} style={{ width: '100%', height: 'auto' }} />
                <div style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.originalName || p.name}</div>
              </div>
            ))}
          </div>
        ) : <div style={{ color: '#666' }}>No files selected</div>}
      </div>

      {uploadProgress !== null && (
        <div style={{ marginTop: 8 }}>Uploading: {uploadProgress}%</div>
      )}

      <div style={{ marginTop: 12 }}>
        <button type="submit">Create Roll</button>
      </div>
    </form>
  );
}