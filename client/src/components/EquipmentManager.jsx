import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  getCameras, createCamera, updateCamera, deleteCamera, uploadCameraImage,
  getLenses, createLens, updateLens, deleteLens, uploadLensImage,
  getFlashes, createFlash, updateFlash, deleteFlash, uploadFlashImage,
  getScanners, createScanner, updateScanner, deleteScanner, uploadScannerImage,
  getFilmBacks, createFilmBack, updateFilmBack, deleteFilmBack, uploadFilmBackImage,
  getFilms, createFilm, updateFilm, deleteFilm, uploadFilmImage, getFilmConstants,
  getEquipmentConstants, getEquipmentRelatedRolls, buildUploadUrl
} from '../api';
import { useNavigate } from 'react-router-dom';
import ModalDialog from './ModalDialog';
import SearchInput from './shared/SearchInput';
import { Camera, Aperture, Zap, Box, Scan, Film, Plus, Edit2, Trash2, Upload, Package, ImageIcon } from 'lucide-react';
import '../styles/forms.css';

const TABS = [
  { key: 'cameras', label: 'Cameras', icon: Camera },
  { key: 'lenses', label: 'Lenses', icon: Aperture },
  { key: 'flashes', label: 'Flashes', icon: Zap },
  { key: 'film-backs', label: 'Film Backs', icon: Box },
  { key: 'scanners', label: 'Scanners', icon: Scan },
  { key: 'films', label: 'Films', icon: Film }
];

export default function EquipmentManager() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('cameras');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [constants, setConstants] = useState(null);
  const [filmConstants, setFilmConstants] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [relatedRolls, setRelatedRolls] = useState([]);
  const [loadingRolls, setLoadingRolls] = useState(false);

  useEffect(() => {
    getEquipmentConstants().then(setConstants).catch(console.error);
    getFilmConstants().then(setFilmConstants).catch(console.error);
  }, []);

  const loadItems = useCallback(async (noCache = false) => {
    setLoading(true);
    try {
      let data;
      switch (activeTab) {
        case 'cameras': data = await getCameras({}, noCache); break;
        case 'lenses': data = await getLenses({}, noCache); break;
        case 'flashes': data = await getFlashes({}, noCache); break;
        case 'film-backs': data = await getFilmBacks({}, noCache); break;
        case 'scanners': data = await getScanners({}, noCache); break;
        case 'films': data = await getFilms(noCache); break;
        default: data = [];
      }
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(`Failed to load ${activeTab}:`, err);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    loadItems();
    setSelectedId(null);
    setEditItem(null);
    setSearchQuery(''); // Reset search when tab changes
  }, [loadItems]);

  // Filter items by search query
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const query = searchQuery.toLowerCase();
    return items.filter(item => {
      const name = (item.name || '').toLowerCase();
      const brand = (item.brand || item.manufacturer || '').toLowerCase();
      return name.includes(query) || brand.includes(query);
    });
  }, [items, searchQuery]);

  const selectedItem = items.find(i => i.id === selectedId);

  // Fetch related rolls for selected equipment using API
  useEffect(() => {
    // Reset when no item selected
    if (!selectedItem || !selectedItem.id) {
      setRelatedRolls([]);
      setLoadingRolls(false);
      return;
    }
    
    // Map tab to equipment type for API
    const typeMap = {
      'cameras': 'camera',
      'lenses': 'lens',
      'flashes': 'flash',
      'film-backs': 'film-back',
      'scanners': 'scanner',
      'films': 'film'
    };
    const equipType = typeMap[activeTab];
    if (!equipType) {
      setRelatedRolls([]);
      return;
    }
    
    let isCancelled = false;
    setLoadingRolls(true);
    
    getEquipmentRelatedRolls(equipType, selectedItem.id, 12)
      .then(response => {
        if (isCancelled) return;
        // Ensure we always set an array
        const rolls = Array.isArray(response) ? response : [];
        setRelatedRolls(rolls);
      })
      .catch(err => {
        if (isCancelled) return;
        console.error('Failed to fetch related rolls:', err);
        setRelatedRolls([]);
      })
      .finally(() => {
        if (!isCancelled) setLoadingRolls(false);
      });
    
    // Cleanup function to prevent state updates after unmount
    return () => { isCancelled = true; };
  }, [selectedItem?.id, activeTab]);

  const handleCreate = async (data) => {
    try {
      let created;
      switch (activeTab) {
        case 'cameras': created = await createCamera(data); break;
        case 'lenses': created = await createLens(data); break;
        case 'flashes': created = await createFlash(data); break;
        case 'film-backs': created = await createFilmBack(data); break;
        case 'scanners': created = await createScanner(data); break;
        case 'films': created = await createFilm(data); break;
        default: return;
      }
      setItems(prev => [...prev, created]);
      setShowAddModal(false);
      setSelectedId(created.id);
    } catch (err) {
      console.error('Create failed:', err);
      alert('Failed to create item');
    }
  };

  const handleUpdate = async (id, data) => {
    try {
      let updated;
      switch (activeTab) {
        case 'cameras': updated = await updateCamera(id, data); break;
        case 'lenses': updated = await updateLens(id, data); break;
        case 'flashes': updated = await updateFlash(id, data); break;
        case 'film-backs': updated = await updateFilmBack(id, data); break;
        case 'scanners': updated = await updateScanner(id, data); break;
        case 'films': updated = await updateFilm({ id, ...data }); break;
        default: return;
      }
      setItems(prev => prev.map(i => i.id === id ? updated : i));
      setEditItem(null);
    } catch (err) {
      console.error('Update failed:', err);
      alert('Failed to update item');
    }
  };

  const handleDelete = async (id) => {
    try {
      switch (activeTab) {
        case 'cameras': await deleteCamera(id); break;
        case 'lenses': await deleteLens(id); break;
        case 'flashes': await deleteFlash(id); break;
        case 'film-backs': await deleteFilmBack(id); break;
        case 'scanners': await deleteScanner(id); break;
        case 'films': await deleteFilm(id); break;
        default: return;
      }
      setItems(prev => prev.filter(i => i.id !== id));
      if (selectedId === id) setSelectedId(null);
      setConfirmDelete(null);
    } catch (err) {
      console.error('Delete failed:', err);
      alert('Failed to delete item');
    }
  };

  const handleImageUpload = async (id, file) => {
    try {
      switch (activeTab) {
        case 'cameras': await uploadCameraImage(id, file); break;
        case 'lenses': await uploadLensImage(id, file); break;
        case 'flashes': await uploadFlashImage(id, file); break;
        case 'film-backs': await uploadFilmBackImage(id, file); break;
        case 'scanners': await uploadScannerImage(id, file); break;
        case 'films': await uploadFilmImage(id, file); break;
        default: return;
      }
      await loadItems(true);
    } catch (err) {
      console.error('Image upload failed:', err);
      alert('Image upload failed');
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-background text-foreground animate-in fade-in duration-500 overflow-hidden">
      <div className="flex-1 flex flex-col p-6 lg:p-8 min-h-0 w-full overflow-hidden">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-divider pb-6 mb-6 flex-shrink-0">
          <div>
             <h2 className="text-3xl font-bold tracking-tight">Equipment Library</h2>
             <p className="text-default-500 mt-1">Manage your cameras, lenses, flashes, and film formats</p>
          </div>
          <button 
             onClick={() => setShowAddModal(true)}
             className="flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium shadow-sm hover:opacity-90 transition-opacity"
          >
             <Plus className="w-5 h-5" /> Add {TABS.find(t => t.key === activeTab)?.label.slice(0, -1) || 'Item'}
          </button>
        </header>

        <div className="flex p-1 bg-content1 rounded-xl border border-divider mb-6 flex-shrink-0">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`
                  flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap
                  ${isActive 
                    ? 'bg-background text-foreground shadow-sm ring-1 ring-black/5 dark:ring-white/10' 
                    : 'text-default-500 hover:text-foreground hover:bg-content2'
                  }
                `}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex gap-6 flex-1 min-h-0">
          {/* List Panel - Fixed 320px width */}
          <div className="w-80 flex-shrink-0 bg-content1 rounded-xl border border-divider shadow-sm flex flex-col overflow-hidden" style={{ maxHeight: 'calc(100vh - 260px)' }}>
            <div className="p-3 border-b border-divider flex-shrink-0">
              <SearchInput
                placeholder={`Search ${activeTab}...`}
                value={searchQuery}
                onChange={setSearchQuery}
              />
            </div>

            <div className="flex-1 p-2 space-y-1 overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.2) transparent' }}>
              {loading ? (
                <div className="py-12 flex justify-center"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div></div>
              ) : filteredItems.length === 0 ? (
                <div className="py-20 text-center text-default-400">
                   <Package className="w-12 h-12 mx-auto mb-3 opacity-20" />
                   <p>{searchQuery ? 'No matches found' : 'No items found'}</p>
                </div>
              ) : (
                filteredItems.map(item => (
                  <div
                    key={item.id}
                    onClick={() => { setSelectedId(item.id); setEditItem(null); }}
                    className={`
                      group p-3 rounded-lg cursor-pointer transition-all flex gap-3 border
                      ${selectedId === item.id 
                        ? 'bg-primary/10 border-primary/30 shadow-sm' 
                        : 'bg-transparent border-transparent hover:bg-content2'
                      }
                    `}
                  >
                    <div className="w-16 h-16 rounded-lg bg-content2 overflow-hidden flex-shrink-0 flex items-center justify-center relative">
                      {(item.image_path || item.thumbPath) ? (
                        <img src={buildUploadUrl(item.image_path || item.thumbPath)} alt={item.name} className="w-full h-full object-cover" />
                      ) : (
                        (() => { const Icon = TABS.find(t=>t.key===activeTab)?.icon; return Icon ? <Icon className="w-6 h-6 text-default-300" /> : null; })()
                      )}
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                      <h4 className={`font-semibold text-sm truncate ${selectedId === item.id ? 'text-primary' : 'text-foreground'}`}>
                        {item.name || 'Unnamed'}
                      </h4>
                      <p className="text-xs text-default-500 truncate mt-0.5">{item.brand || item.manufacturer || 'Unknown Brand'}</p>
                      <div className="flex items-center gap-2 mt-2">
                        {item.status && (
                           <span className={`text-[10px] px-1.5 py-0.5 rounded border uppercase tracking-wider font-semibold ${
                             item.status === 'owned' ? 'bg-green-500/10 text-green-600 border-green-500/20 dark:text-green-400' : 
                             item.status === 'wishlist' ? 'bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400' :
                             'bg-zinc-500/10 text-zinc-600 border-zinc-500/20 dark:text-zinc-400'
                           }`}>{item.status}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            
            <div className="p-2 border-t border-divider text-xs text-default-400 text-center flex-shrink-0">
               {searchQuery ? `${filteredItems.length} of ${items.length}` : `${items.length} items`}
            </div>
          </div>

          {/* Detail Panel - Takes remaining space */}
          <div className="flex-1 bg-content1 rounded-xl border border-divider shadow-sm flex flex-col overflow-hidden" style={{ maxHeight: 'calc(100vh - 260px)' }}>
            {selectedItem ? (
              editItem ? (
                <EquipmentForm 
                  type={activeTab}
                  initialData={editItem}
                  constants={activeTab === 'films' ? filmConstants : constants}
                  onSave={async (data) => {
                    await handleUpdate(selectedItem.id, data);
                  }}
                  onCancel={() => setEditItem(null)}
                />
               ) : (
                <div className="p-6 lg:p-8 overflow-y-auto flex-1 animate-in fade-in slide-in-from-right-4 duration-300">
                   <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 mb-8">
                      <div className="w-32 h-32 rounded-2xl bg-content2 overflow-hidden flex items-center justify-center shadow-lg relative group">
                        {(selectedItem.image_path || selectedItem.thumbPath) ? (
                           <img src={buildUploadUrl(selectedItem.image_path || selectedItem.thumbPath)} alt={selectedItem.name} className="w-full h-full object-cover" />
                        ) : (
                           (() => { const Icon = TABS.find(t=>t.key===activeTab)?.icon; return Icon ? <Icon className="w-12 h-12 text-default-300" /> : null; })()
                        )}
                        <label className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-white cursor-pointer transition-opacity">
                           <Upload className="w-6 h-6 mb-1" />
                           <span className="text-xs font-medium">Change</span>
                           <input type="file" className="hidden" accept="image/*" onChange={(e) => e.target.files[0] && handleImageUpload(selectedItem.id, e.target.files[0])} />
                        </label>
                      </div>
                      
                      <div className="flex-1 pt-2">
                         <div className="flex justify-between items-start">
                            <div>
                               <h1 className="text-3xl font-bold text-foreground mb-2">{selectedItem.name}</h1>
                               <div className="text-xl text-default-500">{selectedItem.brand || selectedItem.manufacturer}</div>
                            </div>
                            <div className="flex gap-2">
                               <button onClick={() => setEditItem(selectedItem)} className="p-2 text-default-500 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors">
                                  <Edit2 className="w-5 h-5" />
                               </button>
                               <button onClick={() => setConfirmDelete({id: selectedItem.id, name: selectedItem.name})} className="p-2 text-default-500 hover:text-danger hover:bg-danger/10 rounded-lg transition-colors">
                                  <Trash2 className="w-5 h-5" />
                               </button>
                            </div>
                         </div>
                      </div>
                   </div>
                   
                   <div className="mt-6">
                      <EquipmentDetails item={selectedItem} type={activeTab} />
                   </div>
                   
                   {/* Related Rolls Section */}
                   {(activeTab === 'cameras' || activeTab === 'lenses' || activeTab === 'films' || activeTab === 'scanners' || activeTab === 'flashes' || activeTab === 'film-backs') && (
                     <div className="mt-8 pt-6 border-t border-divider">
                       <div className="flex items-center justify-between mb-4">
                         <h3 className="text-lg font-semibold text-foreground">
                           Related Rolls {!loadingRolls && `(${relatedRolls?.length || 0})`}
                         </h3>
                       </div>
                       {loadingRolls ? (
                         <div className="text-center py-8 text-default-400">
                           <p className="text-sm">Loading related rolls...</p>
                         </div>
                       ) : (relatedRolls?.length > 0) ? (
                         <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-1.5">
                           {relatedRolls.map(roll => (
                             <div
                               key={roll.id}
                               onClick={() => navigate(`/rolls/${roll.id}`)}
                               className="group cursor-pointer flex flex-col gap-1"
                             >
                               <div className="aspect-square rounded bg-content2 overflow-hidden relative">
                                 {(roll.coverPath || roll.cover_photo) ? (
                                   <img src={buildUploadUrl(roll.coverPath || roll.cover_photo)} alt="" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                                 ) : (
                                   <div className="w-full h-full flex items-center justify-center">
                                      <ImageIcon className="w-4 h-4 text-default-300" />
                                   </div>
                                 )}
                                 <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                               </div>
                               <div className="min-w-0 text-center">
                                 <div className="text-[12px] font-medium text-foreground/80 truncate group-hover:text-primary transition-colors">
                                   {roll.title || `Roll #${roll.id}`}
                                 </div>
                               </div>
                             </div>
                           ))}
                         </div>
                       ) : (
                         <div className="text-center py-8 text-default-400">
                           <p className="text-sm">No rolls found with this equipment</p>
                         </div>
                       )}
                     </div>
                   )}
                </div>
               )
            ) : (
               <div className="flex-1 flex flex-col items-center justify-center text-default-400 p-8">
                  <div className="w-24 h-24 rounded-full bg-content2/50 flex items-center justify-center mb-6">
                     {(() => { const Icon = TABS.find(t=>t.key===activeTab)?.icon; return Icon ? <Icon className="w-10 h-10 text-default-300" /> : null; })()}
                  </div>
                  <h3 className="text-xl font-semibold text-foreground mb-2">No Item Selected</h3>
                  <p className="max-w-xs text-center">Select an item from the list to view details or click "Add New" to create one.</p>
               </div>
            )}
          </div>
        </div>
      </div>
      
      {showAddModal && <EquipmentForm isNew type={activeTab} constants={activeTab === 'films' ? filmConstants : constants} onSave={handleCreate} onCancel={() => setShowAddModal(false)} />}
      
      {confirmDelete && (
        <ModalDialog isOpen title="Delete Item" message={`Are you sure you want to delete "${confirmDelete.name}"?`} type="confirm" onConfirm={() => handleDelete(confirmDelete.id)} onCancel={() => setConfirmDelete(null)} />
      )}
    </div>
  );
}


function DetailRow({ label, value, capitalize }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-1">
       <span className="text-xs font-semibold text-default-500 uppercase tracking-wide">{label}</span>
       <span className={`text-sm text-foreground font-medium ${capitalize ? 'capitalize' : ''}`}>{value}</span>
    </div>
  );
}

// ========================================
// CONSTANTS - Synced with server (packages/shared/constants/equipment.js)
// ========================================

const CAMERA_TYPES = [
  'SLR', 'Rangefinder', 'P&S', 'TLR', 'Medium Format', 
  'Large Format', 'Instant', 'Half Frame', 'Other'
];

const LENS_MOUNTS = [
  'M42', 'Pentax K', 'Nikon F', 'Canon FD', 'Canon EF', 
  'Minolta MD', 'Minolta A', 'Leica M', 'Leica R', 'Leica L',
  'Contax/Yashica', 'Olympus OM', 'Sony A', 'Sony E',
  'Micro Four Thirds', 'Fuji X', 'Hasselblad V', 'Mamiya 645',
  'Mamiya RB/RZ', 'Pentax 645', 'Pentax 67', 'Fixed'
];

const FILM_FORMATS = [
  '135', '120', '220', '110', '127', 
  'Large Format 4x5', 'Large Format 8x10', 
  'Instant', 'APS', 'Half Frame'
];

const SCANNER_TYPES = [
  'Flatbed', 'Film Scanner', 'Drum Scanner', 
  'DSLR Scan Rig', 'Virtual Drum', 'Lab Scanner', 'Other'
];

const FILM_BACK_SUB_FORMATS = [
  { value: '645', label: '6x4.5 (645)' },
  { value: '6x6', label: '6x6' },
  { value: '6x7', label: '6x7' },
  { value: '6x8', label: '6x8' },
  { value: '6x9', label: '6x9' },
  { value: '6x12', label: '6x12' },
  { value: '6x17', label: '6x17' }
];

const FILM_BACK_MOUNTS = [
  'Hasselblad V', 'Mamiya RB67', 'Mamiya RZ67', 'Mamiya 645',
  'Pentax 645', 'Pentax 67', 'Bronica ETR', 'Bronica SQ', 
  'Bronica GS-1', 'Rollei SL66', 'Graflex', 'Universal'
];

const METER_TYPES = ['None', 'Match-Needle', 'Center-Weighted', 'Matrix', 'Spot', 'Evaluative'];
const FOCUS_TYPES = ['Manual', 'Auto', 'Hybrid'];
const CONDITIONS = ['Mint', 'Excellent', 'Good', 'Fair', 'Poor', 'For Parts'];
const STATUSES = ['Owned', 'Sold', 'Wishlist', 'Borrowed', 'Lab'];
const SENSOR_TYPES = ['CCD', 'CMOS', 'PMT'];
const BIT_DEPTHS = [8, 12, 14, 16, 24, 48];

function EquipmentDetails({ item, type }) {
  // Format production years
  const getProductionYears = () => {
    if (!item.production_year_start && !item.production_year_end) return null;
    if (item.production_year_start && item.production_year_end) {
      return `${item.production_year_start} - ${item.production_year_end}`;
    }
    if (item.production_year_start) return `${item.production_year_start} -`;
    return `- ${item.production_year_end}`;
  };

  // Config for what to show based on type
  const getSpecs = () => {
    const common = [
      { label: type === 'films' ? 'Manufacturer' : 'Brand', value: item.brand || item.manufacturer },
      { label: 'Model', value: item.model },
    ];

    const specific = {
      cameras: [
        { label: 'Type', value: item.type },
        { label: 'Format', value: item.format },
        { label: 'Lens Mount', value: item.mount },
        { label: 'Meter', value: item.meter_type },
        { label: 'Shutter Range', value: (item.shutter_speed_max || item.shutter_speed_min) ? `${item.shutter_speed_max || ''} - ${item.shutter_speed_min || ''}` : null },
        { label: 'Weight', value: item.weight_g ? `${item.weight_g}g` : null },
        { label: 'Battery', value: item.battery_type },
        { label: 'Production', value: getProductionYears() },
        { label: 'Built-in Flash', value: item.has_built_in_flash ? `Yes${item.flash_gn ? ` (GN ${item.flash_gn})` : ''}` : null },
        ...(item.has_fixed_lens ? [
           { label: 'Fixed Lens', value: 'Yes' },
           { label: 'Focal Length', value: item.fixed_lens_focal_length ? `${item.fixed_lens_focal_length}mm` : null },
           { label: 'Max Aperture', value: item.fixed_lens_max_aperture ? `f/${item.fixed_lens_max_aperture}` : null }
        ] : [])
      ],
      lenses: [
        { label: 'Mount', value: item.mount },
        { label: 'Focal Range', value: item.focal_length_min ? `${item.focal_length_min}${item.focal_length_max ? '-' + item.focal_length_max : ''}mm` : null },
        { label: 'Max Aperture', value: item.max_aperture ? `f/${item.max_aperture}${item.max_aperture_tele ? ` - f/${item.max_aperture_tele}` : ''}` : null },
        { label: 'Min Aperture', value: item.min_aperture ? `f/${item.min_aperture}` : null },
        { label: 'Focus Type', value: item.focus_type, capitalize: true },
        { label: 'Optical Design', value: (item.elements || item.groups) ? `${item.elements || '?'}片${item.groups || '?'}组` : null },
        { label: 'Filter Size', value: item.filter_size ? `${item.filter_size}mm` : null },
        { label: 'Aperture Blades', value: item.blade_count },
        { label: 'Min Focus', value: item.min_focus_distance ? `${item.min_focus_distance}m` : null },
        { label: 'Magnification', value: item.magnification_ratio },
        { label: 'Weight', value: item.weight_g ? `${item.weight_g}g` : null },
        { label: 'Production', value: getProductionYears() },
        { label: 'Macro', value: item.is_macro ? 'Yes' : null },
        { label: 'Stabilization', value: item.image_stabilization ? 'Yes' : null }
      ],
      films: [
        { label: 'ISO', value: item.iso },
        { label: 'Format', value: item.format },
        { label: 'Category', value: item.category },
        { label: 'Process', value: item.process }
      ],
      'film-backs': [
        { label: 'Format', value: item.format },
        { label: 'Frame Size', value: item.sub_format },
        { label: 'Frame Dimensions', value: (item.frame_width_mm || item.frame_height_mm) ? `${item.frame_width_mm || '?'} × ${item.frame_height_mm || '?'}mm` : null },
        { label: 'Mount', value: item.mount_type },
        { label: 'Magazine Type', value: item.magazine_type },
        { label: 'Frames/Roll', value: item.frames_per_roll },
        { label: 'Compatible Cameras', value: item.compatible_cameras },
        { label: 'Motorized', value: item.is_motorized ? 'Yes' : null },
        { label: 'Dark Slide', value: item.has_dark_slide !== 0 ? 'Yes' : 'No' }
      ],
      scanners: [
        { label: 'Type', value: item.type },
        { label: 'Max Resolution', value: item.max_resolution ? `${item.max_resolution} DPI` : null },
        { label: 'Sensor', value: item.sensor_type },
        { label: 'Bit Depth', value: item.bit_depth ? `${item.bit_depth}-bit` : null },
        { label: 'Formats', value: item.supported_formats },
        { label: 'Software', value: item.default_software },
        { label: 'IR Cleaning', value: item.has_infrared_cleaning ? 'Yes' : null }
      ],
      flashes: [
        { label: 'Guide Number', value: item.guide_number },
        { label: 'Power Source', value: item.power_source },
        { label: 'Recycle Time', value: item.recycle_time ? `${item.recycle_time}s` : null },
        { label: 'TTL', value: item.ttl_compatible ? 'Yes' : 'No' },
        { label: 'Auto Mode', value: item.has_auto_mode ? 'Yes' : null },
        { label: 'Swivel Head', value: item.swivel_head ? 'Yes' : null },
        { label: 'Bounce Head', value: item.bounce_head ? 'Yes' : null }
      ]
    };

    // Ownership info for all types
    const ownership = [
      { label: 'Status', value: item.status, capitalize: true },
      { label: 'Condition', value: item.condition },
      { label: 'Serial Number', value: item.serial_number },
      { label: 'Acquired', value: item.purchase_date },
      { label: 'Price', value: item.purchase_price ? `¥${item.purchase_price}` : null },
    ];

    return {
      specs: [...common, ...(specific[type] || [])].filter(x => x.value !== null && x.value !== undefined && x.value !== ''),
      ownership: ownership.filter(x => x.value !== null && x.value !== undefined && x.value !== '')
    };
  };

  const { specs, ownership } = getSpecs();

  return (
    <div className="space-y-8">
      {/* Technical Specifications */}
      <div>
        <h4 className="text-xs font-bold text-default-400 uppercase tracking-wider mb-4 flex items-center gap-2">
          <span className="w-1 h-4 bg-primary/60 rounded-full" />
          Specifications
        </h4>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-8 gap-y-5">
          {specs.map((spec, i) => (
            <DetailRow key={i} {...spec} />
          ))}
        </div>
      </div>
      
      {/* Ownership Info */}
      {ownership.length > 0 && (
        <div className="pt-6 border-t border-divider">
          <h4 className="text-xs font-bold text-default-400 uppercase tracking-wider mb-4 flex items-center gap-2">
            <span className="w-1 h-4 bg-primary/60 rounded-full" />
            Ownership
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-x-8 gap-y-5">
            {ownership.map((spec, i) => (
              <DetailRow key={i} {...spec} />
            ))}
          </div>
        </div>
      )}
      
      {item.notes && (
        <div className="pt-6 border-t border-divider">
          <h4 className="text-xs font-bold text-default-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <span className="w-1 h-4 bg-primary/60 rounded-full" />
            Notes
          </h4>
          <p className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed bg-default-50/50 p-4 rounded-xl border border-default-100">{item.notes}</p>
        </div>
      )}
    </div>
  );
}

// ========================================
// FORM SECTION COMPONENT
// ========================================
function FormSection({ title, children, className = '' }) {
  return (
    <div className={`col-span-1 md:col-span-2 ${className}`}>
      <h4 className="text-xs font-bold text-default-400 uppercase tracking-wider mb-4 flex items-center gap-2">
        <span className="w-1 h-4 bg-primary/60 rounded-full" />
        {title}
      </h4>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {children}
      </div>
    </div>
  );
}

function EquipmentForm({ type, initialData = {}, onSave, onCancel, isNew }) {
  const [form, setForm] = useState(initialData || {});
  const handleChange = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  // Unified input styles
  const inputClass = "w-full h-10 px-3 rounded-lg bg-default-100 border border-default-200 hover:border-default-300 focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all outline-none text-foreground text-sm placeholder:text-default-400";
  const selectClass = "w-full h-10 px-3 rounded-lg bg-default-100 border border-default-200 hover:border-default-300 focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all outline-none text-foreground text-sm cursor-pointer appearance-none";
  const labelClass = "text-xs font-semibold text-default-500 uppercase tracking-wide mb-1.5 block";
  const checkboxClass = "w-4 h-4 rounded border-default-300 text-primary focus:ring-primary/50 cursor-pointer";

  // Field wrapper for consistent sizing
  const Field = ({ label, children, span = 1 }) => (
    <div className={span === 2 ? 'col-span-2' : 'col-span-1'}>
      <label className={labelClass}>{label}</label>
      {children}
    </div>
  );

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex justify-between items-center px-6 py-4 border-b border-divider flex-shrink-0 bg-content1">
        <h3 className="text-xl font-bold">{isNew ? 'Add New' : 'Edit'} {TABS.find(t=>t.key===type)?.label.slice(0,-1)}</h3>
      </div>
       
      {/* Scrollable Form Content */}
      <form onSubmit={(e) => { e.preventDefault(); onSave(form); }} className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          
          {/* ========================================
              BASIC INFO SECTION - All types
          ======================================== */}
          <FormSection title="Basic Information">
            <Field label="Name *" span={2}>
              <input required autoFocus className={inputClass} value={form.name || ''} onChange={e => handleChange('name', e.target.value)} placeholder="Display name" />
            </Field>
            <Field label={type === 'films' ? 'Manufacturer' : 'Brand'}>
              <input className={inputClass} value={form.brand || ''} onChange={e => handleChange('brand', e.target.value)} placeholder={type === 'films' ? 'e.g. Kodak' : 'e.g. Nikon'} />
            </Field>
            <Field label="Model">
              <input className={inputClass} value={form.model || ''} onChange={e => handleChange('model', e.target.value)} placeholder="Model number" />
            </Field>
          </FormSection>

          {/* ========================================
              CAMERA SPECIFICATIONS
          ======================================== */}
          {type === 'cameras' && (
            <>
              <FormSection title="Camera Specifications">
                <Field label="Type">
                  <select className={selectClass} value={form.type || ''} onChange={e => handleChange('type', e.target.value)}>
                    <option value="">Select Type</option>
                    {CAMERA_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </Field>
                <Field label="Film Format">
                  <select className={selectClass} value={form.format || ''} onChange={e => handleChange('format', e.target.value)}>
                    <option value="">Select Format</option>
                    {FILM_FORMATS.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </Field>
                <Field label="Lens Mount">
                  <select className={selectClass} value={form.mount || ''} onChange={e => handleChange('mount', e.target.value)}>
                    <option value="">Select Mount</option>
                    {LENS_MOUNTS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </Field>
                <Field label="Meter Type">
                  <select className={selectClass} value={form.meter_type || ''} onChange={e => handleChange('meter_type', e.target.value)}>
                    <option value="">None</option>
                    {METER_TYPES.filter(m => m !== 'None').map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </Field>
                <Field label="Shutter Max">
                  <input className={inputClass} value={form.shutter_speed_max || ''} onChange={e => handleChange('shutter_speed_max', e.target.value)} placeholder="e.g. 1/500" />
                </Field>
                <Field label="Shutter Min">
                  <input className={inputClass} value={form.shutter_speed_min || ''} onChange={e => handleChange('shutter_speed_min', e.target.value)} placeholder="e.g. 1s" />
                </Field>
                <Field label="Weight (g)">
                  <input type="number" className={inputClass} value={form.weight_g || ''} onChange={e => handleChange('weight_g', e.target.value ? parseFloat(e.target.value) : null)} placeholder="grams" />
                </Field>
                <Field label="Battery">
                  <input className={inputClass} value={form.battery_type || ''} onChange={e => handleChange('battery_type', e.target.value)} placeholder="e.g. LR44" />
                </Field>
                <Field label="Prod. Start Year">
                  <input type="number" className={inputClass} value={form.production_year_start || ''} onChange={e => handleChange('production_year_start', e.target.value ? parseInt(e.target.value) : null)} placeholder="e.g. 1985" />
                </Field>
                <Field label="Prod. End Year">
                  <input type="number" className={inputClass} value={form.production_year_end || ''} onChange={e => handleChange('production_year_end', e.target.value ? parseInt(e.target.value) : null)} placeholder="e.g. 1995" />
                </Field>
                <div className="col-span-2 flex items-center gap-6 pt-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className={checkboxClass} checked={form.has_built_in_flash === 1} onChange={e => handleChange('has_built_in_flash', e.target.checked ? 1 : 0)} />
                    <span className="text-sm font-medium">Built-in Flash</span>
                  </label>
                  {form.has_built_in_flash === 1 && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-default-500">GN:</span>
                      <input type="number" className={`${inputClass} w-20`} value={form.flash_gn || ''} onChange={e => handleChange('flash_gn', e.target.value ? parseFloat(e.target.value) : null)} placeholder="GN" />
                    </div>
                  )}
                </div>
              </FormSection>

              {/* Fixed Lens Options */}
              <div className="col-span-2 p-4 bg-default-50/50 rounded-xl border border-default-100">
                <label className="flex items-center gap-3 cursor-pointer mb-4">
                  <input type="checkbox" className={checkboxClass} checked={form.has_fixed_lens === 1 || form.has_fixed_lens === true} onChange={e => handleChange('has_fixed_lens', e.target.checked ? 1 : 0)} />
                  <span className="text-sm font-medium text-foreground">Fixed Lens Camera</span>
                </label>
                {(form.has_fixed_lens === 1 || form.has_fixed_lens === true) && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2 border-t border-default-100">
                    <Field label="Focal Length (mm)">
                      <input type="number" className={inputClass} value={form.fixed_lens_focal_length || ''} onChange={e => handleChange('fixed_lens_focal_length', e.target.value ? parseFloat(e.target.value) : null)} placeholder="35" />
                    </Field>
                    <Field label="Max Aperture">
                      <input type="number" step="0.1" className={inputClass} value={form.fixed_lens_max_aperture || ''} onChange={e => handleChange('fixed_lens_max_aperture', e.target.value ? parseFloat(e.target.value) : null)} placeholder="2.8" />
                    </Field>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ========================================
              LENS SPECIFICATIONS
          ======================================== */}
          {type === 'lenses' && (
            <FormSection title="Lens Specifications">
              <Field label="Min Focal (mm)">
                <input type="number" className={inputClass} value={form.focal_length_min || ''} onChange={e => handleChange('focal_length_min', e.target.value ? parseFloat(e.target.value) : null)} placeholder="Wide/Prime" />
              </Field>
              <Field label="Max Focal (mm)">
                <input type="number" className={inputClass} value={form.focal_length_max || ''} onChange={e => handleChange('focal_length_max', e.target.value ? parseFloat(e.target.value) : null)} placeholder="Tele (zoom)" />
              </Field>
              <Field label="Mount">
                <select className={selectClass} value={form.mount || ''} onChange={e => handleChange('mount', e.target.value)}>
                  <option value="">Select Mount</option>
                  {LENS_MOUNTS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </Field>
              <Field label="Focus Type">
                <select className={selectClass} value={form.focus_type || 'Manual'} onChange={e => handleChange('focus_type', e.target.value)}>
                  {FOCUS_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Max Aperture">
                <input type="number" step="0.1" className={inputClass} value={form.max_aperture || ''} onChange={e => handleChange('max_aperture', e.target.value ? parseFloat(e.target.value) : null)} placeholder="e.g. 1.4" />
              </Field>
              <Field label="Max Aperture (Tele)">
                <input type="number" step="0.1" className={inputClass} value={form.max_aperture_tele || ''} onChange={e => handleChange('max_aperture_tele', e.target.value ? parseFloat(e.target.value) : null)} placeholder="e.g. 5.6 (zoom)" />
              </Field>
              <Field label="Min Aperture">
                <input type="number" step="0.1" className={inputClass} value={form.min_aperture || ''} onChange={e => handleChange('min_aperture', e.target.value ? parseFloat(e.target.value) : null)} placeholder="e.g. 22" />
              </Field>
              <Field label="Filter Size (mm)">
                <input type="number" className={inputClass} value={form.filter_size || ''} onChange={e => handleChange('filter_size', e.target.value ? parseFloat(e.target.value) : null)} placeholder="52" />
              </Field>
              <Field label="Aperture Blades">
                <input type="number" className={inputClass} value={form.blade_count || ''} onChange={e => handleChange('blade_count', e.target.value ? parseInt(e.target.value) : null)} placeholder="e.g. 8" />
              </Field>
              <Field label="Elements">
                <input type="number" className={inputClass} value={form.elements || ''} onChange={e => handleChange('elements', e.target.value ? parseInt(e.target.value) : null)} placeholder="镜片数" />
              </Field>
              <Field label="Groups">
                <input type="number" className={inputClass} value={form.groups || ''} onChange={e => handleChange('groups', e.target.value ? parseInt(e.target.value) : null)} placeholder="镜组数" />
              </Field>
              <Field label="Weight (g)">
                <input type="number" className={inputClass} value={form.weight_g || ''} onChange={e => handleChange('weight_g', e.target.value ? parseFloat(e.target.value) : null)} placeholder="grams" />
              </Field>
              <Field label="Min Focus (m)">
                <input type="number" step="0.01" className={inputClass} value={form.min_focus_distance || ''} onChange={e => handleChange('min_focus_distance', e.target.value ? parseFloat(e.target.value) : null)} placeholder="0.45" />
              </Field>
              <Field label="Magnification">
                <input className={inputClass} value={form.magnification_ratio || ''} onChange={e => handleChange('magnification_ratio', e.target.value)} placeholder="e.g. 1:1, 1:2" />
              </Field>
              <Field label="Prod. Start Year">
                <input type="number" className={inputClass} value={form.production_year_start || ''} onChange={e => handleChange('production_year_start', e.target.value ? parseInt(e.target.value) : null)} placeholder="e.g. 1985" />
              </Field>
              <Field label="Prod. End Year">
                <input type="number" className={inputClass} value={form.production_year_end || ''} onChange={e => handleChange('production_year_end', e.target.value ? parseInt(e.target.value) : null)} placeholder="e.g. 1995" />
              </Field>
              <div className="col-span-4 flex items-center gap-6 pt-3 border-t border-default-100">
                <label className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-default-100">
                  <input type="checkbox" className={checkboxClass} checked={form.is_macro === 1} onChange={e => handleChange('is_macro', e.target.checked ? 1 : 0)} />
                  <span className="text-sm font-medium">Macro Lens</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-default-100">
                  <input type="checkbox" className={checkboxClass} checked={form.image_stabilization === 1} onChange={e => handleChange('image_stabilization', e.target.checked ? 1 : 0)} />
                  <span className="text-sm font-medium">Image Stabilization</span>
                </label>
              </div>
            </FormSection>
          )}

          {/* ========================================
              FLASH SPECIFICATIONS
          ======================================== */}
          {type === 'flashes' && (
            <FormSection title="Flash Specifications">
              <Field label="Guide Number">
                <input type="number" className={inputClass} value={form.guide_number || ''} onChange={e => handleChange('guide_number', e.target.value ? parseFloat(e.target.value) : null)} placeholder="e.g. 36" />
              </Field>
              <Field label="Power Source">
                <input className={inputClass} value={form.power_source || ''} onChange={e => handleChange('power_source', e.target.value)} placeholder="e.g. 4xAA" />
              </Field>
              <Field label="Recycle Time (s)">
                <input type="number" step="0.1" className={inputClass} value={form.recycle_time || ''} onChange={e => handleChange('recycle_time', e.target.value ? parseFloat(e.target.value) : null)} placeholder="e.g. 3.5" />
              </Field>
              <div className="col-span-1" /> {/* Spacer */}
              <div className="col-span-4 grid grid-cols-2 md:grid-cols-4 gap-4 pt-3 border-t border-default-100">
                <label className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-default-100">
                  <input type="checkbox" className={checkboxClass} checked={form.ttl_compatible === 1} onChange={e => handleChange('ttl_compatible', e.target.checked ? 1 : 0)} />
                  <span className="text-sm">TTL Compatible</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-default-100">
                  <input type="checkbox" className={checkboxClass} checked={form.has_auto_mode === 1} onChange={e => handleChange('has_auto_mode', e.target.checked ? 1 : 0)} />
                  <span className="text-sm">Auto Mode</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-default-100">
                  <input type="checkbox" className={checkboxClass} checked={form.swivel_head === 1} onChange={e => handleChange('swivel_head', e.target.checked ? 1 : 0)} />
                  <span className="text-sm">Swivel Head</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-default-100">
                  <input type="checkbox" className={checkboxClass} checked={form.bounce_head === 1} onChange={e => handleChange('bounce_head', e.target.checked ? 1 : 0)} />
                  <span className="text-sm">Bounce Head</span>
                </label>
              </div>
            </FormSection>
          )}

          {/* ========================================
              FILM BACK SPECIFICATIONS
          ======================================== */}
          {type === 'film-backs' && (
            <FormSection title="Film Back Specifications">
              <Field label="Format">
                <select className={selectClass} value={form.format || ''} onChange={e => handleChange('format', e.target.value)}>
                  <option value="">Select Format</option>
                  <option value="120">120</option>
                  <option value="220">220</option>
                  <option value="4x5">4x5</option>
                  <option value="Instant">Polaroid/Instant</option>
                  <option value="Other">Other</option>
                </select>
              </Field>
              <Field label="Sub-Format">
                <select className={selectClass} value={form.sub_format || ''} onChange={e => handleChange('sub_format', e.target.value)}>
                  <option value="">Select Frame Size</option>
                  {FILM_BACK_SUB_FORMATS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </Field>
              <Field label="Mount Type">
                <select className={selectClass} value={form.mount_type || ''} onChange={e => handleChange('mount_type', e.target.value)}>
                  <option value="">Select Mount</option>
                  {FILM_BACK_MOUNTS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </Field>
              <Field label="Magazine Type">
                <input className={inputClass} value={form.magazine_type || ''} onChange={e => handleChange('magazine_type', e.target.value)} placeholder="e.g. A12, A24" />
              </Field>
              <Field label="Frames/Roll">
                <input type="number" className={inputClass} value={form.frames_per_roll || ''} onChange={e => handleChange('frames_per_roll', e.target.value ? parseInt(e.target.value) : null)} placeholder="e.g. 12" />
              </Field>
              <Field label="Frame Width (mm)">
                <input type="number" step="0.1" className={inputClass} value={form.frame_width_mm || ''} onChange={e => handleChange('frame_width_mm', e.target.value ? parseFloat(e.target.value) : null)} placeholder="56" />
              </Field>
              <Field label="Frame Height (mm)">
                <input type="number" step="0.1" className={inputClass} value={form.frame_height_mm || ''} onChange={e => handleChange('frame_height_mm', e.target.value ? parseFloat(e.target.value) : null)} placeholder="56" />
              </Field>
              <Field label="Compatible Cameras">
                <input className={inputClass} value={form.compatible_cameras || ''} onChange={e => handleChange('compatible_cameras', e.target.value)} placeholder="e.g. 500C, 500CM, 503CW" />
              </Field>
              <div className="col-span-4 grid grid-cols-2 md:grid-cols-3 gap-4 pt-3 border-t border-default-100">
                <label className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-default-100">
                  <input type="checkbox" className={checkboxClass} checked={form.is_motorized === 1} onChange={e => handleChange('is_motorized', e.target.checked ? 1 : 0)} />
                  <span className="text-sm">Motorized</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-default-100">
                  <input type="checkbox" className={checkboxClass} checked={form.has_dark_slide !== 0} onChange={e => handleChange('has_dark_slide', e.target.checked ? 1 : 0)} />
                  <span className="text-sm">Has Dark Slide</span>
                </label>
              </div>
            </FormSection>
          )}

          {/* ========================================
              SCANNER SPECIFICATIONS
          ======================================== */}
          {type === 'scanners' && (
            <FormSection title="Scanner Specifications">
              <Field label="Type">
                <select className={selectClass} value={form.type || ''} onChange={e => handleChange('type', e.target.value)}>
                  <option value="">Select Type</option>
                  {SCANNER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Max Resolution (DPI)">
                <input type="number" className={inputClass} value={form.max_resolution || ''} onChange={e => handleChange('max_resolution', e.target.value ? parseInt(e.target.value) : null)} placeholder="e.g. 4800" />
              </Field>
              <Field label="Sensor Type">
                <select className={selectClass} value={form.sensor_type || ''} onChange={e => handleChange('sensor_type', e.target.value)}>
                  <option value="">Select Sensor</option>
                  {SENSOR_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Bit Depth">
                <select className={selectClass} value={form.bit_depth || ''} onChange={e => handleChange('bit_depth', e.target.value ? parseInt(e.target.value) : null)}>
                  <option value="">Select</option>
                  {BIT_DEPTHS.map(b => <option key={b} value={b}>{b}-bit</option>)}
                </select>
              </Field>
              <Field label="Supported Formats" span={2}>
                <input className={inputClass} value={form.supported_formats || ''} onChange={e => handleChange('supported_formats', e.target.value)} placeholder="e.g. 35mm, 120, 4x5" />
              </Field>
              <Field label="Default Software" span={2}>
                <input className={inputClass} value={form.default_software || ''} onChange={e => handleChange('default_software', e.target.value)} placeholder="e.g. SilverFast, VueScan" />
              </Field>
              <div className="col-span-4 pt-2">
                <label className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-default-100 w-fit">
                  <input type="checkbox" className={checkboxClass} checked={form.has_infrared_cleaning === 1} onChange={e => handleChange('has_infrared_cleaning', e.target.checked ? 1 : 0)} />
                  <span className="text-sm font-medium">Infrared Dust Removal (ICE/iSRD)</span>
                </label>
              </div>
            </FormSection>
          )}

          {/* ========================================
              FILM STOCK SPECIFICATIONS
          ======================================== */}
          {type === 'films' && (
            <FormSection title="Film Specifications">
              <Field label="ISO Speed">
                <input type="number" className={inputClass} value={form.iso || ''} onChange={e => handleChange('iso', e.target.value ? parseInt(e.target.value) : null)} placeholder="e.g. 400" />
              </Field>
              <Field label="Format">
                <select className={selectClass} value={form.format || '135'} onChange={e => handleChange('format', e.target.value)}>
                  {FILM_FORMATS.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </Field>
              <Field label="Category">
                <select className={selectClass} value={form.category || ''} onChange={e => handleChange('category', e.target.value)}>
                  <option value="">Select Category</option>
                  <option value="color-negative">Color Negative</option>
                  <option value="color-reversal">Color Reversal (Slide)</option>
                  <option value="bw-negative">B&W Negative</option>
                  <option value="bw-reversal">B&W Reversal</option>
                  <option value="instant">Instant</option>
                  <option value="cine">Cinema (ECN-2)</option>
                  <option value="other">Other</option>
                </select>
              </Field>
              <Field label="Process">
                <select className={selectClass} value={form.process || ''} onChange={e => handleChange('process', e.target.value)}>
                  <option value="">Select Process</option>
                  <option value="C-41">C-41</option>
                  <option value="E-6">E-6</option>
                  <option value="B&W">B&W</option>
                  <option value="ECN-2">ECN-2</option>
                  <option value="Cross">Cross Process</option>
                  <option value="Other">Other</option>
                </select>
              </Field>
            </FormSection>
          )}

          {/* ========================================
              OWNERSHIP SECTION - All types
          ======================================== */}
          <FormSection title="Ownership Details" className="border-t border-divider pt-6">
            <Field label="Status">
              <select className={selectClass} value={form.status || 'Owned'} onChange={e => handleChange('status', e.target.value)}>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Condition">
              <select className={selectClass} value={form.condition || ''} onChange={e => handleChange('condition', e.target.value)}>
                <option value="">Select Condition</option>
                {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Purchase Date">
              <input type="date" className={inputClass} value={form.purchase_date || ''} onChange={e => handleChange('purchase_date', e.target.value)} />
            </Field>
            <Field label="Purchase Price">
              <input type="number" step="0.01" className={inputClass} value={form.purchase_price || ''} onChange={e => handleChange('purchase_price', e.target.value ? parseFloat(e.target.value) : null)} placeholder="¥" />
            </Field>
            {type !== 'films' && (
              <Field label="Serial Number" span={2}>
                <input className={inputClass} value={form.serial_number || ''} onChange={e => handleChange('serial_number', e.target.value)} placeholder="S/N" />
              </Field>
            )}
            <Field label="Notes" span={type !== 'films' ? 2 : 4}>
              <textarea className={`${inputClass} h-20 py-2 resize-none`} value={form.notes || ''} onChange={e => handleChange('notes', e.target.value)} placeholder="Additional notes..." />
            </Field>
          </FormSection>
        </div>
          
        {/* Footer Actions */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-divider bg-content1/95 backdrop-blur flex-shrink-0">
          <button type="button" onClick={onCancel} className="px-5 py-2 rounded-lg border border-divider hover:bg-content2 font-medium text-sm transition-colors">
            Cancel
          </button>
          <button type="submit" className="px-5 py-2 rounded-lg bg-primary text-primary-foreground font-medium text-sm shadow-sm hover:opacity-90 transition-opacity">
            {isNew ? 'Create' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
}