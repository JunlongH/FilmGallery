# Film Gallery Watch App - Development Documentation

## Project Overview

Film Gallery Watch App is an Android Wear OS application built with React Native. It allows users to view random photos, log film shots, browse their film rolls, and configure server settings directly from their smartwatch.

## Architecture

### Technology Stack
- **Framework**: React Native 0.83.1
- **Language**: TypeScript
- **Navigation**: React Navigation (Native Stack)
- **HTTP Client**: Axios
- **UI Components**: React Native Paper (minimal usage)
- **Geolocation**: react-native-geolocation-service
- **Storage**: AsyncStorage
- **Gestures**: React Native Gesture Handler

### Project Structure
```
watch-app/
├── android/                    # Android native code
│   ├── app/
│   │   ├── src/main/
│   │   │   ├── AndroidManifest.xml  # Wear OS configuration
│   │   │   └── java/com/watchapp/
│   │   └── build.gradle        # App-level Gradle config
│   └── build.gradle            # Project-level Gradle config
├── src/
│   ├── screens/               # UI Screens
│   │   ├── HomeScreen.tsx              # Random photo display
│   │   ├── MainMenuScreen.tsx          # Main menu
│   │   ├── SettingsScreen.tsx          # Server configuration
│   │   ├── ShotLogSelectRollScreen.tsx # Roll selection
│   │   ├── ShotLogParamsScreen.tsx     # Shot parameters
│   │   ├── ShotLogLocationScreen.tsx   # Location input
│   │   ├── MyRollsScreen.tsx           # Roll list
│   │   └── RollDetailScreen.tsx        # Roll photos grid
│   ├── services/              # Business logic
│   │   ├── api.ts             # API service layer
│   │   └── location.ts        # GPS/location service
│   ├── types/                 # TypeScript types
│   │   └── index.ts
│   └── components/            # Reusable components (future)
├── App.tsx                    # App entry point
└── package.json              # Dependencies

```

## Features

### 1. Home Screen (Watch Face)
- **Functionality**: Displays a random photo from the server
- **Gestures**:
  - **Swipe Down**: Refresh random photo
  - **Swipe Up**: Open main menu
- **Implementation**: Uses `PanGestureHandler` from `react-native-gesture-handler`

### 2. Shot Log
Multi-step wizard for logging film shots:
1. **Select Roll**: Choose an active film roll
2. **Parameters**: Set shot count, shutter speed, aperture
3. **Location**: Auto-detect GPS or manual input

**Data Flow**:
- Fetches active rolls from `/api/film-items?status=active`
- Retrieves existing shot logs as JSON string
- Appends new log entry
- Updates via PUT `/api/film-items/:id` with stringified JSON

### 3. My Rolls
- **List View**: Displays all film rolls with status badges
- **Detail View**: 3-column grid of thumbnails
- **API Endpoints**:
  - `/api/film-items` - Get all rolls
  - `/api/photos?roll_id=:id` - Get roll photos

### 4. Settings
- **Server URL Configuration**: Input field for server address
- **Persistence**: Uses AsyncStorage (`@server_url` key)
- **Validation**: Checks for http:// or https:// prefix

## API Integration

### Base Configuration
```typescript
// Default server URL
const DEFAULT_URL = 'http://192.168.1.100:4000';

// Storage key
const SERVER_URL_KEY = '@server_url';
```

### Key Endpoints

| Endpoint | Method | Purpose | Response |
|----------|--------|---------|----------|
| `/api/photos/random` | GET | Fetch random photos | `Photo[]` |
| `/api/film-items` | GET | Get all film rolls | `FilmItem[]` |
| `/api/film-items/:id` | GET | Get specific roll | `FilmItem` |
| `/api/film-items/:id` | PUT | Update roll (shot logs) | `FilmItem` |
| `/api/photos?roll_id=:id` | GET | Get photos by roll | `Photo[]` |

### Image URLs
Images are served from `/uploads/` directory:
```typescript
getImageURL(relativePath: string) {
  return `${baseURL}/uploads/${relativePath}`;
}
```

**Thumbnail Priority**:
1. `positive_thumb_rel_path`
2. `thumb_rel_path`
3. `full_rel_path` (fallback)

## Android Configuration

### Wear OS Manifest
Key features in `AndroidManifest.xml`:
```xml
<uses-feature android:name="android.hardware.type.watch" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<meta-data
  android:name="com.google.android.wearable.standalone"
  android:value="true" />
```

### Build Configuration
- **minSdkVersion**: 25 (Android 7.1.1 - Wear OS 2.0+)
- **targetSdkVersion**: Latest (defined in root build.gradle)
- **Package**: com.watchapp

## Development Setup

### Prerequisites
1. Node.js 18+
2. Android Studio (with Android SDK)
3. JDK 17+
4. Wear OS emulator or physical device

### Installation
```bash
cd watch-app
npm install
```

### Running the App

#### Start Metro Bundler
```bash
npm start
```

#### Run on Device/Emulator
```bash
npm run android
```

#### Build APK
```bash
cd android
./gradlew assembleRelease
```
Output: `android/app/build/outputs/apk/release/app-release.apk`

### Debugging
- **Metro Bundler**: View logs in terminal
- **Chrome DevTools**: Enable Remote JS Debugging
- **React Native Debugger**: Standalone debugging tool

## Data Models

### Photo
```typescript
interface Photo {
  id: number;
  filename: string;
  full_rel_path: string;
  thumb_rel_path?: string;
  positive_thumb_rel_path?: string;
  date_taken?: string;
  camera?: string;
  lens?: string;
  film?: string;
  roll_id?: number;
  roll_title?: string;
}
```

### FilmItem (Roll)
```typescript
interface FilmItem {
  id: number;
  title: string;
  film_type: string;
  film_iso: string;
  camera: string;
  lens: string;
  photographer: string;
  status: string;
  shot_logs?: string; // JSON string
  created_at: string;
  updated_at: string;
}
```

### ShotLog
```typescript
interface ShotLog {
  date: string;           // YYYY-MM-DD
  count: number;          // Number of shots
  lens?: string;
  aperture?: number | null;
  shutter_speed?: string; // e.g., "1/125"
  country?: string;
  city?: string;
  detail_location?: string;
}
```

## Location Service

### GPS Auto-Detection
```typescript
import { autoDetectLocation } from './services/location';

const location = await autoDetectLocation();
// Returns: { country?, city?, detail_location? }
```

### Permissions
- **Runtime Permissions**: Requested on first GPS use
- **Graceful Fallback**: Manual input if permission denied

### Current Implementation
- **Coordinates Only**: Returns latitude/longitude as `detail_location`
- **Future Enhancement**: Integrate reverse geocoding service (Google Maps API)

## UI Design Principles

### Circular UI Optimization
- **Large Touch Targets**: Minimum 48x48dp
- **Padding**: Content padded to avoid screen curve clipping
- **Contrast**: High contrast (white text on black background)

### Typography
- **Headers**: 20-24px bold
- **Body**: 14-16px regular
- **Small Text**: 12px (hints, badges)

### Color Palette
- **Background**: `#000` (Black)
- **Surface**: `#1a1a1a` (Dark Gray)
- **Primary**: `#4CAF50` (Green)
- **Secondary**: `#2196F3` (Blue)
- **Text Primary**: `#fff` (White)
- **Text Secondary**: `#999` (Gray)
- **Text Tertiary**: `#666` (Dark Gray)

## Navigation Flow

```
Home (Watch Face)
  ├─ Swipe Up → Main Menu
  │              ├─ Shot Log → Select Roll → Params → Location → Save
  │              ├─ My Rolls → Roll Detail (Photo Grid)
  │              └─ Settings
  └─ Swipe Down → Refresh Photo
```

## Known Limitations

1. **Reverse Geocoding**: Not implemented (coordinates only)
2. **Image Caching**: No persistent cache (network-dependent)
3. **Offline Mode**: Not supported
4. **Photo Editing**: Not available on watch
5. **Sync**: No phone-watch data sync

## Future Enhancements

### High Priority
- [ ] Implement reverse geocoding (Google Maps API)
- [ ] Add image caching (React Native Fast Image)
- [ ] Improve location accuracy on Wear OS

### Medium Priority
- [ ] Phone-watch companion app sync
- [ ] Voice input for shot notes
- [ ] Complications for watch faces
- [ ] Battery optimization

### Low Priority
- [ ] Custom watch face with photo widget
- [ ] NFC tag scanning for location

## Testing

### Manual Testing Checklist
- [ ] Server URL save/load
- [ ] Random photo display and refresh
- [ ] Shot log creation (all steps)
- [ ] Roll list display
- [ ] Roll detail photo grid
- [ ] GPS auto-detection
- [ ] Navigation gestures
- [ ] Circular UI rendering

### Test Server Setup
Ensure the Film Gallery server is running and accessible:
```bash
# In the server directory
npm start
```

## Troubleshooting

### Issue: "Cannot connect to server"
**Solution**: 
1. Check server URL in Settings
2. Verify watch and server are on same network
3. Ensure server allows local network connections

### Issue: "Location permission denied"
**Solution**: 
1. Go to Android Settings → Apps → Watch App → Permissions
2. Enable Location permission
3. Restart the app

### Issue: "Images not loading"
**Solution**:
1. Check network connectivity
2. Verify image paths in server database
3. Check server `/uploads/` directory permissions

### Issue: "Gradle build fails"
**Solution**:
1. Clean build: `cd android && ./gradlew clean`
2. Rebuild: `./gradlew assembleDebug`
3. Check JDK version (requires JDK 17+)

## Deployment

### Release Checklist
1. Update version in `package.json` and `android/app/build.gradle`
2. Configure signing key in `android/app/build.gradle`
3. Build release APK: `cd android && ./gradlew assembleRelease`
4. Test on physical Wear OS device
5. Document release notes

### Signing Configuration
```gradle
// android/app/build.gradle
signingConfigs {
    release {
        storeFile file('your-release-key.keystore')
        storePassword 'your-store-password'
        keyAlias 'your-key-alias'
        keyPassword 'your-key-password'
    }
}
```

## Maintenance

### Regular Updates
- React Native security patches
- Android SDK updates
- Dependency vulnerability fixes

### Monitoring
- Crash reports (consider React Native Firebase Crashlytics)
- API usage logs
- User feedback

## Contributors
- Architecture: AI Assistant
- Design: Optimized for Wear OS circular displays
- Backend Integration: Film Gallery Server API

## License
Same as Film Gallery parent project

---

**Last Updated**: December 30, 2025  
**React Native Version**: 0.83.1  
**Target Wear OS**: 2.0+
