import React, { useEffect, useState } from 'react';
import LutLibrary from './Settings/LutLibrary';
import ServerSettings from './Settings/ServerSettings';
import { API_BASE } from '../api';

export default function Settings() {
  const [config, setConfig] = useState({});
  const [saving, setSaving] = useState(false);
  const [savingWriteThrough, setSavingWriteThrough] = useState(false);
  const [actualPaths, setActualPaths] = useState(null);
  const [serverInfo, setServerInfo] = useState(null);
  const [activeTab, setActiveTab] = useState('general'); // 'general' | 'luts'

  const isElectron = !!window.__electron;
  const canPickDirs = !!window.__electron?.pickDataRoot && !!window.__electron?.setDataRoot;
  
  // 检测是否连接远程服务器 (非 localhost)
  const isRemoteServer = (() => {
    try {
      const url = new URL(API_BASE);
      const host = url.hostname.toLowerCase();
      return host !== 'localhost' && host !== '127.0.0.1';
    } catch {
      return false;
    }
  })();

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const cfg = await (window.__electron?.getConfig?.() || {});
        if (mounted) setConfig(cfg || {});
        // Fetch actual backend paths for verification (use dynamic API_BASE)
        const res = await fetch(`${API_BASE}/api/health`);
        if (res.ok) {
          const data = await res.json();
          if (mounted && data.storage) setActualPaths(data.storage);
        }
        // Fetch server info (mode, version etc)
        const infoRes = await fetch(`${API_BASE}/api/discover`);
        if (infoRes.ok) {
          const info = await infoRes.json();
          if (mounted) setServerInfo(info);
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
        // Refresh actual paths after change (use dynamic API_BASE)
        try {
          const healthRes = await fetch(`${API_BASE}/api/health`);
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

  return (
    <div>
      <h2>Settings</h2>
      
      {/* Tab Navigation */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid #ddd' }}>
        <button
          onClick={() => setActiveTab('general')}
          style={{
            padding: '10px 20px',
            border: 'none',
            background: activeTab === 'general' ? '#fff' : 'transparent',
            borderBottom: activeTab === 'general' ? '2px solid #5a4632' : '2px solid transparent',
            color: activeTab === 'general' ? '#5a4632' : '#888',
            fontWeight: activeTab === 'general' ? 600 : 400,
            cursor: 'pointer',
            fontSize: 14
          }}
        >
          通用设置
        </button>
        <button
          onClick={() => setActiveTab('server')}
          style={{
            padding: '10px 20px',
            border: 'none',
            background: activeTab === 'server' ? '#fff' : 'transparent',
            borderBottom: activeTab === 'server' ? '2px solid #5a4632' : '2px solid transparent',
            color: activeTab === 'server' ? '#5a4632' : '#888',
            fontWeight: activeTab === 'server' ? 600 : 400,
            cursor: 'pointer',
            fontSize: 14
          }}
        >
          服务器连接
        </button>
        <button
          onClick={() => setActiveTab('luts')}
          style={{
            padding: '10px 20px',
            border: 'none',
            background: activeTab === 'luts' ? '#fff' : 'transparent',
            borderBottom: activeTab === 'luts' ? '2px solid #5a4632' : '2px solid transparent',
            color: activeTab === 'luts' ? '#5a4632' : '#888',
            fontWeight: activeTab === 'luts' ? 600 : 400,
            cursor: 'pointer',
            fontSize: 14
          }}
        >
          LUT 库管理
        </button>
      </div>

      {/* Server Settings Tab */}
      {activeTab === 'server' && (
        <ServerSettings />
      )}

      {/* LUT Library Tab */}
      {activeTab === 'luts' && (
        <div style={{ margin: -16 }}>
          <LutLibrary />
        </div>
      )}

      {/* General Settings Tab */}
      {activeTab === 'general' && (
        <>
          {/* Server Info Card - Show port for mobile/watch connection */}
          {isElectron && (
            <div className="card" style={{ padding: 16, marginBottom: 16, background: '#f8f6f2' }}>
              <h3>📡 服务器信息 (Mobile/Watch 连接)</h3>
              <p style={{ color: '#555', marginBottom: 12 }}>
                Mobile 和 Watch 端可通过以下信息连接到此电脑
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                <div style={{ background: '#fff', padding: '12px 16px', borderRadius: 8, border: '1px solid #e0e0e0' }}>
                  <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>服务端口</div>
                  <div style={{ fontSize: 20, fontWeight: 'bold', color: '#5a4632' }}>
                    {window.__electron?.SERVER_PORT || 4000}
                  </div>
                </div>
                <div style={{ background: '#fff', padding: '12px 16px', borderRadius: 8, border: '1px solid #e0e0e0', flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>API 地址</div>
                  <code style={{ fontSize: 14, color: '#333', wordBreak: 'break-all' }}>
                    {window.__electron?.API_BASE || 'http://127.0.0.1:4000'}
                  </code>
                </div>
              </div>
              <div style={{ marginTop: 12, padding: 8, background: '#e8f5e9', borderRadius: 4, fontSize: 13, color: '#2e7d32' }}>
                💡 在 Mobile/Watch 端设置中，只需输入此电脑的 IP 地址，即可自动发现服务端口
              </div>
            </div>
          )}

          {!isElectron && (
        <div className="card" style={{ padding: 16, marginBottom: 16, color: '#555' }}>
          Storage path settings are only available in the Electron desktop app.
        </div>
      )}

      {/* 远程服务器模式：显示服务器存储信息（只读） */}
      {isRemoteServer && (
        <div className="card" style={{ padding: 16, marginBottom: 16, background: '#f0f7ff' }}>
          <h3>🖥️ 远程服务器存储 (只读)</h3>
          <p style={{ color: '#555', marginBottom: 12 }}>
            当前连接到远程服务器，存储路径由服务器端 Docker 配置管理
          </p>
          
          {actualPaths && (
            <div style={{ background: '#fff', padding: 12, borderRadius: 8, border: '1px solid #d0e0f0' }}>
              <div style={{ marginBottom: 8 }}>
                <span style={{ color: '#666', width: 80, display: 'inline-block' }}>数据库:</span>
                <code style={{ background: '#f5f5f5', padding: '4px 8px', borderRadius: 4 }}>
                  {actualPaths.databasePath}
                </code>
              </div>
              <div>
                <span style={{ color: '#666', width: 80, display: 'inline-block' }}>照片存储:</span>
                <code style={{ background: '#f5f5f5', padding: '4px 8px', borderRadius: 4 }}>
                  {actualPaths.uploadsDir}
                </code>
              </div>
            </div>
          )}
          
          {serverInfo && (
            <div style={{ marginTop: 12, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 13, color: '#666' }}>
                <strong>服务器模式:</strong> {serverInfo.serverMode || 'unknown'}
              </div>
              <div style={{ fontSize: 13, color: '#666' }}>
                <strong>版本:</strong> {serverInfo.version || 'unknown'}
              </div>
            </div>
          )}
          
          <div style={{ marginTop: 12, padding: 8, background: '#fff3cd', borderRadius: 4, fontSize: 13, color: '#856404' }}>
            💡 如需修改服务器存储路径，请在 NAS 上编辑 <code>docker-compose.yml</code> 的 volumes 配置
          </div>
        </div>
      )}

      {/* 本地服务器模式：允许修改路径 */}
      {!isRemoteServer && (
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <h3>Data Location (Database & Uploads)</h3>
        <p style={{ color: '#555' }}>Choose where the database (film.db) and uploads are stored. Useful for OneDrive/Dropbox syncing.</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <code style={{ background: '#f2efe8', padding: '6px 8px', borderRadius: 4 }}>
            {config.dataRoot || '(default) %APPDATA%/FilmGallery'}
          </code>
          <button disabled={saving || !canPickDirs} onClick={chooseDataRoot}>
            {saving ? 'Saving…' : 'Change...'}
          </button>
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
      )}

      {/* Write-through 仅在本地模式显示 */}
      {!isRemoteServer && (
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
      )}

      {/* Legacy 仅在本地模式显示 */}
      {!isRemoteServer && (
      <div className="card" style={{ padding: 16 }}>
        <h3>Legacy: Image Storage Root</h3>
        <p style={{ color: '#555' }}>Override only the uploads folder (not recommended if using Data Location).</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <code style={{ background: '#f2efe8', padding: '6px 8px', borderRadius: 4 }}>
            {config.uploadsRoot || '(default)'}
          </code>
          <button disabled={saving || !canPickDirs} onClick={chooseUploadsRoot}>
            {saving ? 'Saving…' : 'Change...'}
          </button>
        </div>
        <div style={{ marginTop: 8, color: '#777', fontSize: 13 }}>
          Changes apply immediately to the local server. Existing files are not moved automatically.
        </div>
      </div>
      )}
        </>
      )}
    </div>
  );
}
