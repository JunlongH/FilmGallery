# FilmGallery Mobile UI Modernization Plan

**Version:** 2.0 (Refined)  
**Created:** 2026-01-28  
**Status:** Planning  
**Target:** Mobile App (React Native + Expo 54)

---

## 📋 Executive Summary

This plan outlines a comprehensive mobile UI modernization initiative that will transform the FilmGallery mobile app from its current Material Design-based interface into a modern, photographer-focused companion app with:

- **Modern Visual Language:** Clean, immersive design using NativeWind v4
- **Streamlined Navigation:** 6 tabs → 3 tabs with smart grouping
- **New Map Feature:** Interactive photo location visualization
- **Enhanced Usability:** Optimized Quick Meter and Settings access
- **Maintained Functionality:** Zero feature loss during migration

---

## 1. Current State Analysis

### 1.1 Existing Navigation Structure

**Bottom Tab Bar (6 tabs - crowded):**
```
1. Rolls (Overview) → HomeScreen
2. Favorites → FavoritesScreen
3. Themes → ThemesScreen
4. Equipment → EquipmentScreen
5. Inventory → InventoryScreen
6. Stats → StatsScreen
```

**Stack Screens (Modal/Detail views):**
- RollDetailScreen
- PhotoViewScreen
- SettingsScreen (accessed via FAB)
- FilmItemDetailScreen
- ShotLogScreen (Quick Meter destination)
- TagDetailScreen
- FilmRollsScreen
- EquipmentRollsScreen
- NegativeScreen
- LocationDiagnosticScreen

### 1.2 Current UI Stack

**Dependencies (package.json):**
- ✅ React Native Paper 5.11.1 (Material Design 3)
- ✅ NativeWind 4.2.1 (Already installed!)
- ✅ Tailwind CSS 3.4.19 (Already installed!)
- ✅ react-native-maps 1.20.1 (Already installed!)
- ✅ @expo/vector-icons 15.0.3
- ✅ react-native-gesture-handler 2.28.0
- ✅ Expo Image 3.0.10

**Current Theme System:**
- Centralized design tokens in `src/theme.js`
- Light/Dark mode support via Material Design 3
- Colors: Warm earthy tones (#5A4632 primary, #3E6B64 secondary)
- Consistent spacing/radius definitions

### 1.3 Pain Points Identified

1. **Navigation Overload:** 6 bottom tabs make the UI feel cluttered
2. **Inconsistent Access:** Settings hidden in FAB, not immediately discoverable
3. **Quick Meter:** Double-action required (FAB → Select Film Item)
4. **Missing Map:** No visual geo-exploration like desktop client
5. **Material Design Look:** Generic appearance, not "photographer-focused"

---

## 2. Vision & Objectives

Transform the FilmGallery mobile app into a modern, cohesive, and "pro-grade" photographer's companion. We will **enhance** the existing Material Design 3 foundation with **NativeWind** styling for a bespoke, immersive aesthetic.

### Key Goals
*   **Modern Aesthetics:** Clean typography, edge-to-edge imagery, consistent spacing, glassmorphism effects, and seamless dark mode.
*   **Simplified Navigation:** Reduce the current 6-tab clutter into a streamlined **3-tab architecture**.
*   **New Map Feature:** Visualize photo locations interactively, matching the desktop client's capabilities.
*   **Improved UX:** Better accessibility for high-frequency actions like "Quick Meter" and "Settings".
*   **Zero Breaking Changes:** All existing features remain accessible, just reorganized.

---

## 3. Technology Stack & Dependencies

### 3.1 Core UI Libraries

| Library | Version | Status | Purpose |
|---------|---------|--------|---------|
| **NativeWind** | 4.2.1 | ✅ Installed | Tailwind CSS for React Native |
| **Tailwind CSS** | 3.4.19 | ✅ Installed | Design system foundation |
| **React Native Paper** | 5.11.1 | ✅ Keep | Base components (migrate styling) |
| **react-native-maps** | 1.20.1 | ✅ Installed | Map visualization |
| **Expo Image** | 3.0.10 | ✅ Installed | Optimized image loading |
| **expo-linear-gradient** | 15.0.7 | ✅ Installed | Gradient effects |

### 3.2 Icons Strategy

**Current:** `@expo/vector-icons` (MaterialCommunityIcons)  
**Proposed:** **Hybrid Approach**
- Keep existing icons for compatibility
- Add **Lucide React Native** for new modern icons
- Gradual migration (non-breaking)

```bash
npm install lucide-react-native
```

### 3.3 Additional Enhancements

**Optional but Recommended:**
- `expo-blur` - Glassmorphism effects for overlays
- `react-native-reanimated` - ✅ Already installed (4.1.1)
- `@shopify/flash-list` - High-performance lists (consider for Timeline)

### 3.4 Configuration Requirements

**NativeWind Setup:**
1. ✅ Dependencies installed
2. ⚠️ Need to verify `tailwind.config.js`
3. ⚠️ Need to verify Babel configuration
4. ⚠️ Need to create design tokens mapping

**Map Integration:**
1. ✅ `react-native-maps` installed
2. ⚠️ Need Google Maps API key (Android)
3. ⚠️ Need Apple Maps configuration (iOS)

---

## 4. Navigation Architecture Redesign

### 4.1 Problem Statement

**Current Issue:** The current bottom bar has too many items:
```
Rolls | Favorites | Themes | Equipment | Inventory | Stats
```
This creates:
- Visual clutter (6 icons + labels)
- Difficult thumb reach on larger phones
- Reduced tap target sizes
- Information overload for new users

### 4.2 Proposed Solution: 3-Tab Architecture

**New Bottom Tab Structure:**

```
┌─────────────────────────────────────────────────┐
│  [Timeline]    [Map]    [Library]               │
└─────────────────────────────────────────────────┘
```

#### Tab 1: Timeline (Gallery)
**Icon:** `filmstrip` / `image-multiple`  
**Purpose:** Main feed of film rolls  
**Content:** Refactored `HomeScreen`
- Year filter pills (horizontal scroll)
- Immersive roll cards with edge-to-edge covers
- Pull-to-refresh
- Search/filter

#### Tab 2: Map (NEW)
**Icon:** `map` / `globe`  
**Purpose:** Full-screen interactive map showing photo clusters  
**Content:** New `MapScreen`
- Photo marker clustering (like desktop)
- Bottom sheet for photo preview
- Filter bar (date, film type, roll)
- "Search this area" button
- Tap marker → Navigate to PhotoViewScreen

#### Tab 3: Library (Dashboard)
**Icon:** `grid-3x3` / `apps`  
**Purpose:** Management hub and navigation center  
**Content:** New `LibraryScreen` (Bento Box Layout)
- **Inventory** - Film stock management
- **Equipment** - Cameras/lenses
- **Favorites** - Starred photos
- **Themes/Tags** - Tag management
- **Stats** - Analytics & insights
- **Settings** - App configuration (moved from FAB)

### 4.3 Navigation Flow Diagram

```
Main (3 Tabs)
├── Timeline Tab
│   ├── HomeScreen (refactored)
│   └── → RollDetailScreen
│       └── → PhotoViewScreen
│
├── Map Tab (NEW)
│   ├── MapScreen
│   └── → PhotoViewScreen (on marker tap)
│       └── → RollDetailScreen (view full roll)
│
└── Library Tab (NEW)
    ├── LibraryScreen (dashboard)
    ├── → InventoryScreen
    │   └── → FilmItemDetailScreen
    │       └── → ShotLogScreen
    ├── → EquipmentScreen
    │   └── → EquipmentRollsScreen
    ├── → FavoritesScreen
    │   └── → PhotoViewScreen
    ├── → ThemesScreen
    │   └── → TagDetailScreen
    ├── → StatsScreen
    └── → SettingsScreen (moved from FAB)
```

### 4.4 Quick Meter Optimization

**Current Problem:**
- FAB button → Modal → Select film item → Navigate to ShotLog
- Too many steps for a frequent action

**Proposed Solution - Option A (Recommended):**
- **Header Action Button** in Timeline tab
- Icon: `camera-iris` or `flash`
- Directly opens film item selector modal
- Quick access from primary screen

**Proposed Solution - Option B (Alternative):**
- Dedicated widget in Library dashboard
- "Active Films" card showing loaded film items
- Tap to go directly to ShotLog

**Implementation Note:** Start with Option A, consider Option B as enhancement

### 4.5 Settings Access

**Current:** FAB button (floating action button)  
**New:** Library Tab → Settings Card
- Consistent with mobile app conventions
- Frees up screen space
- Grouped with other management functions

---

## 5. Design System & Visual Language

### 5.1 NativeWind Design Tokens

**Base Configuration (`tailwind.config.js`):**

```javascript
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './App.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}'
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // FilmGallery Brand Colors (from existing theme.js)
        primary: {
          DEFAULT: '#5A4632',
          light: '#E9DCCF',
          dark: '#3B3024',
        },
        secondary: {
          DEFAULT: '#3E6B64',
          light: '#CCE5E1',
          dark: '#2A4A45',
        },
        accent: '#FF9E9E',
        surface: {
          light: '#F5F0E6',
          DEFAULT: '#FAF9F7',
          dark: '#121315',
        },
        // Semantic colors
        success: '#4CAF50',
        warning: '#FFB347',
        error: '#B00020',
      },
      spacing: {
        'xs': '4px',
        'sm': '8px',
        'md': '12px',
        'lg': '16px',
        'xl': '24px',
        '2xl': '32px',
      },
      borderRadius: {
        'sm': '6px',
        'md': '10px',
        'lg': '16px',
        'xl': '20px',
        '2xl': '24px',
      },
      fontFamily: {
        // Use system fonts for better performance
        sans: ['System'],
        heading: ['System'],
      },
      fontSize: {
        'xs': ['12px', { lineHeight: '16px' }],
        'sm': ['14px', { lineHeight: '20px' }],
        'base': ['16px', { lineHeight: '24px' }],
        'lg': ['18px', { lineHeight: '28px' }],
        'xl': ['20px', { lineHeight: '28px' }],
        '2xl': ['24px', { lineHeight: '32px' }],
        '3xl': ['30px', { lineHeight: '36px' }],
      },
    },
  },
  plugins: [],
};
```

### 5.2 Dark Mode Strategy

**NativeWind Dark Mode:**
```javascript
// Leverage existing darkMode state from ApiContext
import { useColorScheme } from 'nativewind';

// In component:
const { colorScheme, setColorScheme } = useColorScheme();

// Sync with existing darkMode state
useEffect(() => {
  setColorScheme(darkMode ? 'dark' : 'light');
}, [darkMode]);
```

**Class Usage:**
```jsx
<View className="bg-surface dark:bg-surface-dark">
  <Text className="text-primary dark:text-primary-light">
    Title
  </Text>
</View>
```

### 5.3 Typography System

**Heading Hierarchy:**
```jsx
// H1 - Page Title
<Text className="text-3xl font-bold text-primary dark:text-primary-light">
  Film Rolls
</Text>

// H2 - Section Title
<Text className="text-2xl font-semibold text-primary dark:text-primary-light">
  Recent Activity
</Text>

// H3 - Card Title
<Text className="text-xl font-semibold text-primary-dark dark:text-primary-light">
  Kodak Portra 400
</Text>

// Body Text
<Text className="text-base text-gray-700 dark:text-gray-300">
  Description text
</Text>

// Caption
<Text className="text-sm text-gray-500 dark:text-gray-400">
  2025-01-28
</Text>
```

### 5.4 Card Component Pattern

**Modern Immersive Card:**
```jsx
<View className="rounded-xl overflow-hidden bg-white dark:bg-gray-900 shadow-lg">
  {/* Edge-to-edge image */}
  <Image 
    source={{ uri }} 
    className="w-full h-48"
    contentFit="cover"
  />
  
  {/* Overlay gradient */}
  <LinearGradient
    colors={['transparent', 'rgba(0,0,0,0.7)']}
    className="absolute bottom-0 left-0 right-0 h-32"
  />
  
  {/* Content overlay */}
  <View className="absolute bottom-0 left-0 right-0 p-4">
    <Text className="text-xl font-bold text-white">
      Roll Title
    </Text>
    <Text className="text-sm text-gray-200">
      Portra 400 • 2025-01-28
    </Text>
  </View>
</View>
```

### 5.5 Component Migration Strategy

**Phase 1: Wrapper Components (Non-Breaking)**
- Create NativeWind wrapper components that accept Paper components
- Example: `<Card>` wraps `<Card>` from Paper with Tailwind classes

**Phase 2: Gradual Replacement**
- Replace Paper components one screen at a time
- Keep Paper for complex components (Dialogs, Date Pickers)

**Phase 3: Full Migration**
- Remove unused Paper components
- Reduce bundle size

**DO NOT REMOVE:**
- `react-native-paper` - Keep for backward compatibility
- Existing theme system - Use as fallback
- FAB, Dialog, Portal - Complex components that work well

---

## 6. Screen-by-Screen Design Specifications

### 6.1 Timeline (HomeScreen - Refactored)

**Current State:**
- Material Card with padded content
- Cover image with text overlay
- Year filter chips

**New Design:**
```
┌─────────────────────────────────────┐
│ ≡ Film Rolls          🔍 📷 ⚙️     │ Header
├─────────────────────────────────────┤
│ [All] [2025] [2024] [2023] ...     │ Year Pills (horizontal scroll)
├─────────────────────────────────────┤
│ ┌─────────────────────────────────┐ │
│ │                                 │ │
│ │     [Full-width Roll Cover]    │ │ Edge-to-edge image
│ │                                 │ │
│ │ ┌─────────────────────────────┐ │ │
│ │ │ Roll #042               ↗ │ │ │ Gradient overlay
│ │ │ Portra 400 • 2025-01-28   │ │ │
│ │ └─────────────────────────────┘ │ │
│ └─────────────────────────────────┘ │
│                                     │
│ [Another Roll Card]                 │
│ [Another Roll Card]                 │
└─────────────────────────────────────┘
```

**Implementation Details:**
- Remove Paper `<Card>` padding
- Use NativeWind `rounded-xl overflow-hidden`
- `LinearGradient` overlay at bottom
- Year chips use `className="bg-primary/10 dark:bg-primary/20"`
- Header actions: Search, Quick Meter (📷), Settings (⚙️)

**Components:**
```jsx
// RollCard.jsx (new)
<Pressable className="mb-lg rounded-xl overflow-hidden shadow-lg">
  <Image source={{ uri }} className="w-full h-52" />
  <LinearGradient
    colors={['transparent', 'rgba(0,0,0,0.7)']}
    className="absolute bottom-0 w-full h-28"
  />
  <View className="absolute bottom-0 p-4">
    <Text className="text-xl font-bold text-white">{title}</Text>
    <Text className="text-sm text-gray-200">{filmName} • {date}</Text>
  </View>
</Pressable>
```

### 6.2 Map Screen (NEW)

**Desktop Reference:** Based on `client/src/pages/MapPage.jsx`

**Design:**
```
┌─────────────────────────────────────┐
│ ← Map              [Filter] [Globe] │ Header
├─────────────────────────────────────┤
│                                     │
│                                     │
│          [Interactive Map]          │
│       with clustered markers        │
│                                     │
│                                     │
├─────────────────────────────────────┤
│ ┌─────────────────────────────────┐ │ Bottom Sheet (collapsed)
│ │ ⚊  45 photos in this area      │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘

On marker tap:
┌─────────────────────────────────────┐
│ ┌─────────────────────────────────┐ │ Bottom Sheet (expanded)
│ │ [Thumb] Roll #042               │ │
│ │         Portra 400              │ │
│ │         Tokyo, Japan            │ │
│ │         [View Details →]        │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

**Features:**
1. **Map Clustering:** Use `react-native-maps-clustering` or custom implementation
2. **Marker Design:** Custom film roll icon with count badge
3. **Filters:** Date range, roll selection, film type (filter bar)
4. **Bottom Sheet:** Photo preview with basic info
5. **Actions:** 
   - Tap marker → Show bottom sheet
   - Tap sheet → Navigate to PhotoViewScreen
   - Long press marker → Navigate to RollDetailScreen

**API Integration:**
```javascript
// src/api/photos.js
export async function getPhotosWithLocation(filters = {}) {
  const { data } = await axios.get(`${baseUrl}/api/photos`, {
    params: {
      hasLocation: true,
      ...filters
    }
  });
  return data;
}
```

**Components:**
```jsx
// MapScreen.jsx (new)
- <MapView> from react-native-maps
- <Marker> for each photo/cluster
- <BottomSheet> for preview (use reanimated)

// MapMarker.jsx (new)
- Custom marker component
- Badge with photo count

// MapFilterBar.jsx (new)
- Horizontal scroll of filter chips
```

### 6.3 Library Dashboard (NEW)

**Design - Bento Box Layout:**
```
┌─────────────────────────────────────┐
│ Library                             │ Header
├─────────────────────────────────────┤
│ ┌─────────────┐ ┌─────────────────┐ │
│ │  Inventory  │ │   Equipment     │ │ 2-column grid
│ │  📦 42 rolls│ │   📷 5 cameras  │ │
│ └─────────────┘ └─────────────────┘ │
│                                     │
│ ┌───────────────────────────────────┐│
│ │           Favorites               ││ Full-width card
│ │        ⭐ 128 photos              ││
│ └───────────────────────────────────┘│
│                                     │
│ ┌─────────────┐ ┌─────────────────┐ │
│ │   Themes    │ │      Stats      │ │
│ │  🏷️ 24 tags │ │  📊 Analytics   │ │
│ └─────────────┘ └─────────────────┘ │
│                                     │
│ ┌───────────────────────────────────┐│
│ │           Settings                ││
│ │        ⚙️ Configuration           ││
│ └───────────────────────────────────┘│
└─────────────────────────────────────┘
```

**Implementation:**
```jsx
// LibraryScreen.jsx (new)
<ScrollView className="flex-1 bg-surface dark:bg-surface-dark p-lg">
  {/* Two column grid */}
  <View className="flex-row gap-md mb-md">
    <LibraryCard
      title="Inventory"
      icon="package"
      count="42 rolls"
      onPress={() => navigation.navigate('Inventory')}
      className="flex-1"
    />
    <LibraryCard
      title="Equipment"
      icon="camera"
      count="5 cameras"
      onPress={() => navigation.navigate('Equipment')}
      className="flex-1"
    />
  </View>

  {/* Full width cards */}
  <LibraryCard
    title="Favorites"
    icon="heart"
    count="128 photos"
    onPress={() => navigation.navigate('Favorites')}
    layout="full"
  />

  {/* More cards... */}
</ScrollView>

// LibraryCard.jsx (new)
<Pressable 
  className={`
    rounded-xl p-lg bg-white dark:bg-gray-900 
    shadow-md active:scale-95 transition-transform
    ${layout === 'full' ? 'w-full' : ''}
  `}
  onPress={onPress}
>
  <Icon name={icon} size={32} className="text-primary mb-sm" />
  <Text className="text-xl font-bold text-primary dark:text-primary-light">
    {title}
  </Text>
  <Text className="text-sm text-gray-600 dark:text-gray-400">
    {count}
  </Text>
</Pressable>
```

### 6.4 Enhanced Screens

#### Quick Meter Modal (Improved)
```
┌─────────────────────────────────────┐
│ Select Active Film                 × │
├─────────────────────────────────────┤
│ ┌─────────────────────────────────┐ │
│ │ 📷 Kodak Portra 400             │ │ Large touch targets
│ │    Canon AE-1 • ISO 400         │ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ 📷 Fuji Pro 400H                │ │
│ │    Nikon F3 • ISO 400           │ │
│ └─────────────────────────────────┘ │
│                                     │
│ [+ Load New Film]                   │
└─────────────────────────────────────┘
```

#### Settings Screen (Enhanced)
- Keep existing functionality
- Add visual polish with NativeWind
- Group settings into sections
- Add quick actions at top

