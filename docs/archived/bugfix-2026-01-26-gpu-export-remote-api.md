# GPU Export Fix for Remote/Hybrid Mode (2026-01-26)

## Issue
When using Hybrid Mode (Local Rendering + Remote Data Management) or Remote Mode, the GPU export feature failed with:
`GPU Export Failed: backend_connect_failed: connect ECONNREFUSED 127.0.0.1:4000`

## Cause
The `electron-main.js` file had a hardcoded API URL `http://127.0.0.1:4000` in the `filmlab-gpu:result` handler. It did not respect the configured `API_BASE` or `serverMode` settings, causing it to always attempt connection to localhost on port 4000, even if the user configured a remote server.

## Fix
Modified `electron-main.js` to dynamically determine the `API_BASE` consistent with the preload script logic:
1. Load `appConfig` if not loaded.
2. Check `serverMode`.
3. If `local`, use dynamic `actualServerPort`.
4. If `remote` or `hybrid`, use configured `appConfig.apiBase` (fallback to local dynamic port).

## Changes
- `electron-main.js`: Updated `filmlab-gpu:result` handler to use correct `API_BASE`.

## Verification
- Remote Mode: GPU export should now upload result to the remote server defined in settings.
- Local Mode: GPU export should continue to work with local server (dynamic port).
