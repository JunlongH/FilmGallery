# FilmGallery Deployment Guide

FilmGallery supports a split architecture where the Server runs in a Docker container (remotely) and the Client (Electron App) connects to it via API.

## 1. Deploy Server (Docker)

You can deploy the server on any machine with Docker (Linux VPS, NAS, Windows/Mac).

### Prerequisites
- Docker & Docker Compose
- Directories for persistent data: `data/db` and `data/uploads`

### Steps
1. Copy `server/Dockerfile` and `server/docker-compose.yml` to your host.
2. (Optional) Create a `server` folder and copy server source code if building from source, OR build the image locally and push to a registry.
   *Easiest method for now:* Copy the entire `server/` folder to your host, next to `docker-compose.yml`.

3. Configure `docker-compose.yml`:
   ```yaml
   version: '3.8'
   services:
     film-gallery-server:
       build: 
         context: .
         dockerfile: server/Dockerfile
       ports:
         - "4000:4000"
       volumes:
         - ./data/db:/data/db
         - ./data/uploads:/data/uploads
   ```

4. Start the server:
   ```bash
   docker-compose up -d --build
   ```

5. Verify it's running:
   ```bash
   curl http://<SERVER_IP>:4000/api/health
   # Should return {"ok":true}
   ```

## 2. Configure Client (Electron)

The Electron client defaults to `http://127.0.0.1:4000`. To connect to your remote server:

### Option A: Settings UI (Recommended) ⭐

1. Open the FilmGallery Electron App.
2. Click on **Settings** in the sidebar navigation.
3. In the **Server Configuration** section:
   - Enter your server address (e.g., `http://192.168.1.100:4000` or `https://film.yourdomain.com`)
   - Click **Test Connection** to verify the server is reachable
   - Click **Save & Restart** to apply changes
4. The app will restart and connect to the remote server.

**Note:** The Full version will automatically skip starting its local server when configured to use a remote URL.

### Option B: Console Command (Advanced)

1. Open the FilmGallery Electron App.
2. Open DevTools (Ctrl+Shift+I or Cmd+Option+I) -> Console.
3. Run the following command to set your server URL:
   ```javascript
   window.__electron.setApiBase('http://<YOUR_SERVER_IP>:4000')
   ```
4. Restart the app. It will now connect to the remote server.

To revert to local mode:
```javascript
window.__electron.setApiBase('http://127.0.0.1:4000')
```

### Option C: Build-time Configuration (Web Client)
If you are deploying the React web client separately:
1. Create a `.env` file in `client/`:
   ```
   REACT_APP_API_BASE=http://<YOUR_SERVER_IP>:4000
   ```
2. Build the client: `npm run build`

---

## 3. Build Electron Installer (EXE/DMG/AppImage)

To create a distributable installer for Windows/macOS/Linux:

### Prerequisites
- Node.js 18+
- npm or yarn

### Quick Start

```bash
# Navigate to ROOT directory (important!)
cd FilmGalery

# Install all dependencies (client + server + electron)
npm install

# Build installer for current platform
npm run dist

# Output: dist_v9/FilmGallery-Setup-x.x.x.exe (Windows)
#         dist_v9/FilmGallery-x.x.x.dmg (macOS)
#         dist_v9/FilmGallery-x.x.x.AppImage (Linux)
```

### Available Build Commands

```bash
# Development mode (no build, runs from source)
npm run dev              # Client + Electron
npm run dev:full         # Server + Client + Electron

# Production builds
npm run build            # Build React client only
npm run pack             # Package without creating installer

# Create installer (includes local server)
npm run dist             # Full version with local server
npm run dist:full        # Same as above

# Create installer (client only, no server)
npm run dist:client-only # Lightweight version for remote server only
```

### Full Version vs Client-Only Version

**Full Version (Default - `npm run dist`)**
- **Size**: ~200-300MB
- **Includes**: Client + Local Server + Node.js runtime
- **Use case**: Offline usage, or when users don't have access to remote server
- **Behavior**: Automatically starts local server on port 4000
- **Product Name**: `FilmGallery`
- **Output**: `dist_v9/FilmGallery-Setup-x.x.x.exe`

**Client-Only Version (`npm run dist:client-only`)**
- **Size**: ~100MB (50% smaller)
- **Includes**: Client only + Electron runtime
- **Use case**: All users connect to your centralized Docker server
- **Behavior**: Must configure remote server URL (see Configuration section below)
- **Product Name**: `FilmGallery-Client` (can coexist with full version)
- **Output**: `dist_v9_client/FilmGallery-Client-Setup-x.x.x.exe`
- **Pre-configure**: Edit `electron-main.js` before building:
  ```javascript
  // Around line 800
  const DEFAULT_API_BASE = 'http://your-server-ip:4000';
  ```

**Both versions can be installed on the same computer without conflicts.**

### Build for Specific Platform

Edit `package.json` in root directory to customize build targets:
