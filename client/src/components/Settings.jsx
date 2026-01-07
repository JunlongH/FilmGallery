import React, { useEffect, useState } from 'react';
import { API_BASE } from '../api';

export default function Settings() {
  const [config, setConfig] = useState({});
  const [saving, setSaving] = useState(false);
  const [savingWriteThrough, setSavingWriteThrough] = useState(false);
  const [actualPaths, setActualPaths] = useState(null);
  const [apiBase, setApiBase] = useState(API_BASE);
  const [savingApiBase, setSavingApiBase] = useState(false);
  const [apiMessage, setApiMessage] = useState('');
  const [dataRootInput, setDataRootInput] = useState('');
  const [uploadsRootInput, setUploadsRootInput] = useState('');

  const isElectron = !!window.__electron;
  const canPickDirs = !!window.__electron?.pickDataRoot && !!window.__electron?.setDataRoot;

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const cfg = await (window.__electron?.getConfig?.() || {});
        if (mounted) {
          setConfig(cfg || {});
          // Initialize input fields with current config
          if (cfg.dataRoot) setDataRootInput(cfg.dataRoot);
          if (cfg.uploadsRoot) setUploadsRootInput(cfg.uploadsRoot);
        }
        // Load current API base from electron if available
        if (window.__electron?.getApiBase) {
          const base = await window.__electron.getApiBase();
          if (mounted && base) setApiBase(base);
        }
        // Fetch actual backend paths for verification
        const res = await fetch(apiBase + '/api/health');
        if (res.ok) {
          const data = await res.json();
          if (mounted && data.storage) setActualPaths(data.storage);
        }
      } catch {}
    })();
    return () => { mounted = false; };
  }, []);

  async function chooseUploadsRoot() {
    try {
      if (!canPickDirs) return;
      const dir = await window.__electron?.pickUploadsRoot?.();
      if (!dir) return;
      setSaving(true);
      const res = await window.__electron?.setUploadsRoot?.(dir);
      if (res && res.ok) {
        setConfig(res.config || {});
        setUploadsRootInput(dir);
      } else {
        alert('Failed to save.');
      }
    } catch (e) {
      alert('Error: ' + (e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  async function saveUploadsRoot() {
    try {
      if (!uploadsRootInput || !uploadsRootInput.trim()) {
        alert('Please enter a path');
        return;
      }
      setSaving(true);
      const res = await window.__electron?.setUploadsRoot?.(uploadsRootInput.trim());
      if (res && res.ok) {
        setConfig(res.config || {});
      } else {
        alert('Failed to save.');
      }
    } catch (e) {
      alert('Error: ' + (e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  async function chooseDataRoot() {
    try {
      if (!canPickDirs) return;
      const dir = await window.__electron?.pickDataRoot?.();
      if (!dir) return;
      setSaving(true);
      const res = await window.__electron?.setDataRoot?.(dir);
      if (res && res.ok) {
        setConfig(res.config || {});
        setDataRootInput(dir);
        // Refresh actual paths after change
        try {
          const healthRes = await fetch(apiBase + '/api/health');
          if (healthRes.ok) {
            const data = await healthRes.json();
            if (data.storage) setActualPaths(data.storage);
          }
        } catch {}
        alert('Data location updated. The server has been restarted.');
      } else {
        alert('Failed to save.');
      }
    } catch (e) {
      alert('Error: ' + (e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  async function saveDataRoot() {
    try {
      if (!dataRootInput || !dataRootInput.trim()) {
        alert('Please enter a path');
        return;
      }
      setSaving(true);
      const res = await window.__electron?.setDataRoot?.(dataRootInput.trim());
      if (res && res.ok) {
        setConfig(res.config || {});
        // Refresh actual paths after change
        try {
          const healthRes = await fetch(apiBase + '/api/health');
          if (healthRes.ok) {
            const data = await healthRes.json();
            if (data.storage) setActualPaths(data.storage);
          }
        } catch {}
        alert('Data location updated. The server has been restarted.');
      } else {
        alert('Failed to save.');
      }
    } catch (e) {
      alert('Error: ' + (e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  async function toggleWriteThrough(next) {
    if (!window.__electron?.setWriteThrough) return alert('This option is only available in Electron.');
    try {
      setSavingWriteThrough(true);
      const res = await window.__electron.setWriteThrough(next);
      if (res && res.ok) {
        setConfig(res.config || {});
        alert('Write-through mode updated. Backend restarted.');
      } else {
        alert('Failed to update write-through mode.');
      }
    } catch (e) {
      alert('Error: ' + (e?.message || e));
    } finally {
      setSavingWriteThrough(false);
    }
  }

  async function handleApiBaseTest() {
    let testUrl = apiBase.trim();
    if (!testUrl.startsWith('http://') && !testUrl.startsWith('https://')) {
      testUrl = 'http://' + testUrl;
    }

    setSavingApiBase(true);
    setApiMessage('测试连接中...');

    try {
      const response = await fetch(`${testUrl}/api/health`, {
        method: 'GET',
        mode: 'cors',
        cache: 'no-cache'
      });

      if (response.ok) {
        const data = await response.json();
        setApiMessage(`✓ 连接成功！服务器运行时间: ${Math.floor(data.uptime || 0)}秒`);
      } else {
        setApiMessage(`⚠️ 服务器响应异常: ${response.status} ${response.statusText}`);
      }
    } catch (err) {
      setApiMessage(`❌ 连接失败: ${err.message}. 请检查服务器地址和网络连接。`);
    } finally {
      setSavingApiBase(false);
    }
  }

  async function handleApiBaseSave() {
    if (!apiBase || !apiBase.trim()) {
      setApiMessage('请输入服务器地址');
      return;
    }

    let validUrl = apiBase.trim();
    if (!validUrl.startsWith('http://') && !validUrl.startsWith('https://')) {
      validUrl = 'http://' + validUrl;
    }

    setSavingApiBase(true);
    setApiMessage('');

    try {
      if (window.__electron?.setApiBase) {
        await window.__electron.setApiBase(validUrl);
        setApiMessage('✓ 保存成功！应用将在重启后生效。');
        setTimeout(() => {
          if (window.confirm('设置已保存。是否现在重启应用？')) {
            window.location.reload();
          }
        }, 1000);
      } else {
        setApiMessage('⚠️ 此功能仅在 Electron 应用中可用。Web 版本请在构建时配置 .env 文件。');
      }
    } catch (err) {
      setApiMessage('❌ 保存失败: ' + (err.message || '未知错误'));
    } finally {
      setSavingApiBase(false);
    }
  }

  return (
    <div>
      <h2>Settings</h2>

      {!isElectron && (
        <div className="card" style={{ padding: 16, marginBottom: 16, color: '#555' }}>
          Storage path settings are only available in the Electron desktop app.
        </div>
      )}

      {/* Server API Configuration */}
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <h3>Server Configuration (API Base URL)</h3>
        <p style={{ color: '#555' }}>
          Configure the server address. Full version uses local server (127.0.0.1:4000) by default. 
          Client-only version must connect to a remote server.
        </p>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
            Server Address
          </label>
          <input
            type="text"
            value={apiBase}
            onChange={(e) => setApiBase(e.target.value)}
            placeholder="http://192.168.1.100:4000 或 https://film.yourdomain.com"
            style={{
              width: '100%',
              maxWidth: 500,
              padding: '8px 12px',
              fontSize: '14px',
              border: '1px solid #ccc',
              borderRadius: 4,
              boxSizing: 'border-box'
            }}
          />
          <div style={{ marginTop: 6, fontSize: 13, color: '#666' }}>
            Examples: http://127.0.0.1:4000 (local) | http://192.168.1.100:4000 (LAN) | https://film.example.com (remote)
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
          <button
            onClick={handleApiBaseTest}
            disabled={savingApiBase}
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              background: '#666',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              cursor: savingApiBase ? 'not-allowed' : 'pointer',
              opacity: savingApiBase ? 0.6 : 1
            }}
          >
            {savingApiBase ? 'Testing...' : 'Test Connection'}
          </button>

          <button
            onClick={handleApiBaseSave}
            disabled={savingApiBase || !isElectron}
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              background: isElectron ? '#007bff' : '#999',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              cursor: (savingApiBase || !isElectron) ? 'not-allowed' : 'pointer',
              opacity: (savingApiBase || !isElectron) ? 0.6 : 1
            }}
          >
            {savingApiBase ? 'Saving...' : 'Save & Restart'}
          </button>
        </div>

        {apiMessage && (
          <div
            style={{
              padding: 12,
              background: apiMessage.startsWith('✓') ? '#d4edda' : apiMessage.startsWith('❌') ? '#f8d7da' : '#fff3cd',
              color: apiMessage.startsWith('✓') ? '#155724' : apiMessage.startsWith('❌') ? '#721c24' : '#856404',
              borderRadius: 4,
              fontSize: 14
            }}
          >
            {apiMessage}
          </div>
        )}

        <div style={{ marginTop: 12, padding: 12, background: '#e7f3ff', borderRadius: 4, fontSize: 13 }}>
          <strong>💡 Tips:</strong>
          <ul style={{ marginLeft: 16, marginTop: 8, marginBottom: 0, lineHeight: 1.6 }}>
            <li><strong>Full version</strong>: Includes embedded server, defaults to 127.0.0.1:4000</li>
            <li><strong>Client-only version</strong>: Requires remote server connection</li>
            <li>Changes require app restart to take effect</li>
            <li>Ensure server port is accessible and firewall allows connections</li>
          </ul>
        </div>
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <h3>Data Location (Database & Uploads)</h3>
        <p style={{ color: '#555' }}>Choose where the database (film.db) and uploads are stored. Useful for OneDrive/Dropbox syncing.</p>
        
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Data Root Path</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="text"
              value={dataRootInput}
              onChange={(e) => setDataRootInput(e.target.value)}
              placeholder={config.dataRoot || '(default) %APPDATA%/FilmGallery'}
              style={{
                flex: 1,
                padding: '8px 12px',
                fontSize: '14px',
                border: '1px solid #ccc',
                borderRadius: 4,
                boxSizing: 'border-box'
              }}
            />
            {canPickDirs && (
              <button
                disabled={saving}
                onClick={chooseDataRoot}
                style={{
                  padding: '8px 16px',
                  fontSize: '14px',
                  background: '#666',
                  color: 'white',
                  border: 'none',
                  borderRadius: 4,
                  cursor: saving ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                Browse...
              </button>
            )}
            <button
              disabled={saving || !isElectron}
              onClick={saveDataRoot}
              style={{
                padding: '8px 16px',
                fontSize: '14px',
                background: isElectron ? '#007bff' : '#999',
                color: 'white',
                border: 'none',
                borderRadius: 4,
                cursor: (saving || !isElectron) ? 'not-allowed' : 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
          <div style={{ marginTop: 6, fontSize: 13, color: '#666' }}>
            {canPickDirs ? 'Enter path manually or use Browse button for local folders' : 'Enter the absolute path on the remote server (e.g., /data/film-gallery)'}
          </div>
        </div>
        {actualPaths && (
          <div style={{ marginTop: 12, padding: 8, background: '#f9f9f9', borderRadius: 4, fontSize: 13 }}>
            <strong>Backend is currently using:</strong>
            <div style={{ marginTop: 4, color: '#555' }}>
              <div><strong>Database:</strong> {actualPaths.databasePath}</div>
              <div><strong>Uploads:</strong> {actualPaths.uploadsDir}</div>
            </div>
          </div>
        )}
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <h3>Database Write-through (OneDrive即时同步)</h3>
        <p style={{ color: '#555' }}>
          When enabled, commits go straight to film.db (journal_mode=TRUNCATE, synchronous=FULL). Helpful for multi-device OneDrive sync; may be slightly slower than WAL.
        </p>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={!!config.writeThrough}
            disabled={savingWriteThrough}
            onChange={(e) => toggleWriteThrough(e.target.checked)}
          />
          <span>{savingWriteThrough ? 'Updating…' : 'Enable write-through mode'}</span>
        </label>
        <div style={{ marginTop: 8, color: '#777', fontSize: 13 }}>
          Applies immediately and restarts backend. Disable to return to WAL mode (better throughput).
        </div>
      </div>

      <div className="card" style={{ padding: 16 }}>
        <h3>Legacy: Image Storage Root</h3>
        <p style={{ color: '#555' }}>Override only the uploads folder (not recommended if using Data Location).</p>
        
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Uploads Root Path</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="text"
              value={uploadsRootInput}
              onChange={(e) => setUploadsRootInput(e.target.value)}
              placeholder={config.uploadsRoot || '(default)'}
              style={{
                flex: 1,
                padding: '8px 12px',
                fontSize: '14px',
                border: '1px solid #ccc',
                borderRadius: 4,
                boxSizing: 'border-box'
              }}
            />
            {canPickDirs && (
              <button
                disabled={saving}
                onClick={chooseUploadsRoot}
                style={{
                  padding: '8px 16px',
                  fontSize: '14px',
                  background: '#666',
                  color: 'white',
                  border: 'none',
                  borderRadius: 4,
                  cursor: saving ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                Browse...
              </button>
            )}
            <button
              disabled={saving || !isElectron}
              onClick={saveUploadsRoot}
              style={{
                padding: '8px 16px',
                fontSize: '14px',
                background: isElectron ? '#007bff' : '#999',
                color: 'white',
                border: 'none',
                borderRadius: 4,
                cursor: (saving || !isElectron) ? 'not-allowed' : 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
          <div style={{ marginTop: 6, fontSize: 13, color: '#666' }}>
            {canPickDirs ? 'Enter path manually or use Browse button for local folders' : 'Enter the absolute path on the remote server'}
          </div>
        </div>
        
        <div style={{ marginTop: 8, color: '#777', fontSize: 13 }}>
          Changes apply immediately to the server. Existing files are not moved automatically.
        </div>
      </div>
    </div>
  );
}
