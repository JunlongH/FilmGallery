# Photo Map Feature Plan

> **Created:** 2026-01-19  
> **Status:** Planning  
> **Branch:** `feature/photo-map`

---

## 1. Overview

This feature introduces an interactive **Photo Map View** that visualizes the user's photo collection geographically. Users can:

- View photo thumbnails as markers on a world map
- Pan, zoom, and interact with the map seamlessly
- See photos cluster together when zoomed out, and disperse when zoomed in
- Click on individual photos or clusters to preview and navigate to full details

The goal is to provide an intuitive, visually appealing way to explore photos by location.

---

## 2. Technical Stack

| Component | Technology | Rationale |
|-----------|------------|-----------|
| **Map Renderer** | [Leaflet](https://leafletjs.com/) + [react-leaflet](https://react-leaflet.js.org/) | Open-source, lightweight, highly customizable |
| **Clustering** | [react-leaflet-cluster](https://www.npmjs.com/package/react-leaflet-cluster) | Native Leaflet.markercluster integration for React |
| **Tile Provider** | CartoDB Dark Matter or Stamen Toner Lite | Minimalist aesthetic that lets photos stand out |
| **State Management** | Existing Redux store | Consistent with app architecture |
| **Routing** | react-router-dom (v7) | Add `/map` route |

---

## 3. Data Requirements

### 3.1 Existing Schema

Photos already have `latitude` and `longitude` columns (type: `REAL`, nullable).

```sql
-- photos table (relevant columns)
latitude   REAL,  -- e.g., 35.6762
longitude  REAL,  -- e.g., 139.6503
```

### 3.2 API Endpoint

We will create a dedicated endpoint for efficient geo-queries:

```
GET /api/photos/geo
```

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `bounds` | string | Optional. `sw_lat,sw_lng,ne_lat,ne_lng` to filter by visible map area |
| `limit` | number | Optional. Max photos to return (default: 1000) |
| `roll_id` | number | Optional. Filter by specific roll |

**Response:**
```json
{
  "photos": [
    {
      "id": 123,
      "latitude": 35.6762,
      "longitude": 139.6503,
      "thumb_rel_path": "rolls/42/thumb/001-thumb.jpg",
      "roll_id": 42,
      "date_taken": "2025-12-01"
    }
  ],
  "total": 1523,
  "returned": 500
}
```

---

## 4. Architecture & Module Design

```
client/src/
├── pages/
│   └── MapPage.jsx                 # Main map page container
├── components/
│   └── map/
│       ├── PhotoMap.jsx            # Core map component with Leaflet
│       ├── PhotoMarker.jsx         # Custom marker with thumbnail
│       ├── PhotoCluster.jsx        # Custom cluster icon renderer
│       ├── MapControls.jsx         # Zoom, layer toggle, filters
│       ├── MapPhotoPreview.jsx     # Hover/click preview popup
│       └── MapFilterPanel.jsx      # Date range, roll, location filters
├── hooks/
│   └── useGeoPhotos.js             # Data fetching hook for geo photos
├── styles/
│   └── map.css                     # Map-specific styles
└── utils/
    └── geo-helpers.js              # Coordinate utilities
```

---

## 5. Component Specifications

### 5.1 MapPage.jsx

**Responsibilities:**
- Route handler for `/map`
- Layout wrapper (full-screen or sidebar layout)
- Orchestrates filter state and passes to `PhotoMap`

```jsx
// Pseudo-structure
function MapPage() {
  const [filters, setFilters] = useState({ dateRange: null, rollId: null });
  
  return (
    <div className="map-page">
      <MapFilterPanel filters={filters} onChange={setFilters} />
      <PhotoMap filters={filters} />
    </div>
  );
}
```

### 5.2 PhotoMap.jsx

**Responsibilities:**
- Initialize Leaflet MapContainer
- Fetch photos via `useGeoPhotos` hook
- Render `MarkerClusterGroup` with custom icons
- Handle map events (zoom, pan, click)

**Key Props:**
- `filters`: Object with date range, roll ID, etc.
- `onPhotoClick`: Callback when a photo marker is clicked

**Features:**
- Dark tile layer by default (toggle available)
- Smooth zoom animations
- Bounds-based lazy loading for performance

### 5.3 PhotoMarker.jsx

**Responsibilities:**
- Render a circular thumbnail instead of default pin
- Apply subtle shadow and border for depth
- Show hover state with scale animation

**Design:**
```
┌──────────────┐
│   ┌──────┐   │  ← White border (2px)
│   │ IMG  │   │  ← Circular thumbnail (48x48)
│   └──────┘   │
│      ▼       │  ← Optional pointer triangle
└──────────────┘
```

### 5.4 PhotoCluster.jsx

**Responsibilities:**
- Render cluster icon showing count
- Use gradient background matching app theme
- Animate on hover

**Design:**
```
   ┌─────────┐
   │   42    │  ← Photo count
   │  📷     │  ← Optional camera icon
   └─────────┘
```

### 5.5 MapPhotoPreview.jsx

**Responsibilities:**
- Popup shown on marker click
- Display larger thumbnail + metadata
- "View in Roll" button to navigate

**Content:**
- Photo preview (200x200)
- Date taken
- Location name (city, country)
- Camera/lens info (if available)
- Link to RollDetail page

### 5.6 MapFilterPanel.jsx

**Responsibilities:**
- Date range picker
- Roll selector dropdown
- Location/country filter
- Clear all button

---

## 6. Clustering Behavior

### 6.1 Zoom Levels

| Zoom Level | Behavior |
|------------|----------|
| 1-5 | Aggressive clustering (continental) |
| 6-10 | Moderate clustering (city level) |
| 11-14 | Light clustering (neighborhood) |
| 15+ | No clustering (individual markers) |

### 6.2 Spiderfy

When multiple photos share the **exact same coordinates** (e.g., same spot), clicking the cluster "spiderfies" them into a spiral pattern for individual selection.

### 6.3 Performance Considerations

- **Client-side clustering** is sufficient for <5,000 geo-tagged photos
- For larger datasets, implement **server-side clustering** using PostGIS or a custom grid algorithm
- Lazy-load photos based on current map bounds

---

## 7. UI/UX Design Guidelines

### 7.1 Visual Style

- **Dark map tiles** (CartoDB Dark Matter) for cinematic feel
- **Warm accent colors** (#F59E0B amber) for markers
- **Subtle animations** on hover/click (0.2s ease)
- **Minimal chrome** – map takes center stage

### 7.2 Responsive Design

| Breakpoint | Layout |
|------------|--------|
| Desktop (≥1024px) | Full width map, filter panel on left overlay |
| Tablet (768-1023px) | Full width map, filter as top drawer |
| Mobile (<768px) | Full screen map, filter as bottom sheet |

### 7.3 Accessibility

- Keyboard navigation for markers (Tab, Enter)
- ARIA labels for controls
- High contrast mode support
- Screen reader announcements for cluster interactions

---

## 8. Implementation Phases

### Phase 1: Foundation (Core Map)
- [ ] Install dependencies (`leaflet`, `react-leaflet`, `react-leaflet-cluster`)
- [ ] Create `/map` route and `MapPage` component
- [ ] Implement basic `PhotoMap` with tile layer
- [ ] Add `useGeoPhotos` hook fetching all photos with coordinates
- [ ] Display simple circle markers

### Phase 2: Clustering & Markers
- [ ] Integrate `MarkerClusterGroup`
- [ ] Create custom `PhotoMarker` with thumbnails
- [ ] Create custom `PhotoCluster` icons
- [ ] Implement spiderfy for same-location photos

### Phase 3: Interactions
- [ ] Implement click-to-preview popup (`MapPhotoPreview`)
- [ ] Add navigation to RollDetail from popup
- [ ] Implement hover effects on markers

### Phase 4: Filters & Controls
- [ ] Create `MapFilterPanel` component
- [ ] Implement date range filtering
- [ ] Implement roll/location filtering
- [ ] Add tile layer toggle (dark/light/satellite)

### Phase 5: Polish & Performance
- [ ] Bounds-based lazy loading
- [ ] Smooth pan/zoom animations
- [ ] Loading skeleton states
- [ ] Empty state when no geo-tagged photos
- [ ] Error handling

---

## 9. API Changes

### 9.1 New Endpoint

**File:** `server/routes/photos.js`

```javascript
// GET /api/photos/geo
router.get('/geo', async (req, res) => {
  const { bounds, limit = 1000, roll_id } = req.query;
  
  let sql = `
    SELECT id, latitude, longitude, thumb_rel_path, roll_id, date_taken
    FROM photos
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL
  `;
  const params = [];
  
  if (roll_id) {
    sql += ` AND roll_id = ?`;
    params.push(roll_id);
  }
  
  if (bounds) {
    const [sw_lat, sw_lng, ne_lat, ne_lng] = bounds.split(',').map(Number);
    sql += ` AND latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ?`;
    params.push(sw_lat, ne_lat, sw_lng, ne_lng);
  }
  
  sql += ` LIMIT ?`;
  params.push(Number(limit));
  
  const photos = await allAsync(sql, params);
  const total = await getAsync('SELECT COUNT(*) as cnt FROM photos WHERE latitude IS NOT NULL AND longitude IS NOT NULL');
  
  res.json({ photos, total: total.cnt, returned: photos.length });
});
```

---

## 10. Dependencies to Install

```bash
cd client
npm install leaflet react-leaflet react-leaflet-cluster
```

**Leaflet CSS** must be imported in the app:

```javascript
// In client/src/index.js or MapPage.jsx
import 'leaflet/dist/leaflet.css';
```

---

## 11. File Checklist

| File | Purpose | Phase |
|------|---------|-------|
| `client/src/pages/MapPage.jsx` | Main page component | 1 |
| `client/src/components/map/PhotoMap.jsx` | Leaflet map container | 1 |
| `client/src/components/map/PhotoMarker.jsx` | Custom thumbnail marker | 2 |
| `client/src/components/map/PhotoCluster.jsx` | Custom cluster icon | 2 |
| `client/src/components/map/MapPhotoPreview.jsx` | Click popup preview | 3 |
| `client/src/components/map/MapControls.jsx` | Zoom, layer controls | 4 |
| `client/src/components/map/MapFilterPanel.jsx` | Filter sidebar | 4 |
| `client/src/hooks/useGeoPhotos.js` | Data fetching hook | 1 |
| `client/src/styles/map.css` | Map-specific styles | 1 |
| `client/src/utils/geo-helpers.js` | Coordinate utilities | 1 |
| `server/routes/photos.js` | Add `/geo` endpoint | 1 |

---

## 12. Testing Plan

### 12.1 Unit Tests
- `useGeoPhotos` hook: mock API, verify data transformation
- `geo-helpers.js`: test coordinate parsing, bounds calculation

### 12.2 Integration Tests
- Map renders with markers
- Clustering behavior at different zoom levels
- Filter application updates markers

### 12.3 E2E Tests
- Navigate to `/map`, verify map loads
- Click marker, verify preview popup
- Apply filter, verify markers update

---

## 13. Future Enhancements

1. **Heatmap Mode** – Toggle to show photo density as a heatmap
2. **Timeline Slider** – Scrub through time to see photo distribution change
3. **Route Visualization** – Connect photos chronologically to show travel path
4. **Server-side Clustering** – For very large collections (>10k photos)
5. **Offline Map Tiles** – Cache tiles for offline viewing (Electron)
6. **Custom Tile Styles** – Allow users to choose map aesthetics

---

## 14. References

- [Leaflet Documentation](https://leafletjs.com/reference.html)
- [react-leaflet Documentation](https://react-leaflet.js.org/)
- [Leaflet.markercluster](https://github.com/Leaflet/Leaflet.markercluster)
- [CartoDB Basemaps](https://carto.com/basemaps/)

---

**Next Steps:**
1. Review this plan and provide feedback
2. Create `feature/photo-map` branch
3. Begin Phase 1 implementation
