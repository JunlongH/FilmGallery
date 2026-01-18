import React, { useState, useEffect, useCallback } from 'react';
import { API_BASE } from '../../api';

/**
 * 服务器连接设置组件
 * 支持三种模式：
 * 1. 本地服务器 (Electron 内置)
 * 2. 远程服务器 (如 NAS Docker)
 * 3. 混合模式 (远程数据 + 本地算力)
 */
export default function ServerSettings() {
  const isElectron = !!window.__electron;
  
  // Connection state
  const [serverMode, setServerMode] = useState('local'); // 'local' | 'remote' | 'hybrid'
  const [remoteUrl, setRemoteUrl] = useState('');
  const [testStatus, setTestStatus] = useState(null); // null | 'testing' | 'success' | 'error'
  const [serverInfo, setServerInfo] = useState(null);
  const [saving, setSaving] = useState(false);
  
  // Current connection info
  const currentApiBase = window.__electron?.API_BASE || API_BASE;
  const currentPort = window.__electron?.SERVER_PORT || 4000;
  
  // Load saved config
  useEffect(() => {
    (async () => {
      if (window.__electron?.getServerMode) {
        const modeConfig = await window.__electron.getServerMode();
        if (modeConfig) {
          setServerMode(modeConfig.mode || 'local');
          if (modeConfig.mode !== 'local' && modeConfig.apiBase) {
            setRemoteUrl(modeConfig.apiBase);
          }
        }
      } else if (window.__electron?.getConfig) {
        // Fallback to old config format
        const config = await window.__electron.getConfig();
        if (config.serverMode) {
          setServerMode(config.serverMode);
          if (config.apiBase) {
            setRemoteUrl(config.apiBase);
          }
        } else if (config.apiBase && config.apiBase !== `http://127.0.0.1:${currentPort}`) {
          setServerMode(config.useLocalCompute ? 'hybrid' : 'remote');
          setRemoteUrl(config.apiBase);
        }
      }
      // Fetch current server info
      try {
        const res = await fetch(`${currentApiBase}/api/discover`);
        if (res.ok) {
          const data = await res.json();
          setServerInfo(data);
        }
      } catch (e) {
        console.warn('Failed to fetch server info:', e);
      }
    })();
  }, [currentApiBase, currentPort]);

  // Test connection to a server
  const testConnection = useCallback(async (url) => {
    if (!url) return;
    setTestStatus('testing');
    try {
      const testUrl = url.replace(/\/+$/, '');
      const res = await fetch(`${testUrl}/api/discover`, { 
        timeout: 5000,
        mode: 'cors'
      });
      if (res.ok) {
        const data = await res.json();
        // Check for app identifier (server returns "app" not "name")
        if (data.app === 'FilmGallery' || data.name === 'filmgallery') {
          setServerInfo(data);
          setTestStatus('success');
          return true;
        }
      }
      setTestStatus('error');
      return false;
    } catch (e) {
      console.error('Connection test failed:', e);
      setTestStatus('error');
      return false;
    }
  }, []);

  // Save server configuration
  const saveServerConfig = async () => {
    if (!isElectron) return;
    setSaving(true);
    
    try {
      if (serverMode === 'local') {
        // Use local server
        const result = await window.__electron?.setServerMode?.('local', {
          useLocalCompute: true
        });
        if (result?.ok) {
          alert('已切换到本地服务器。需要重启应用以生效。');
        } else {
          alert('保存失败');
        }
      } else {
        // Use remote server (remote or hybrid mode)
        if (!remoteUrl) {
          alert('请输入远程服务器地址');
          setSaving(false);
          return;
        }
        // Test connection first
        const ok = await testConnection(remoteUrl);
        if (!ok) {
          alert('无法连接到远程服务器，请检查地址');
          setSaving(false);
          return;
        }
        
        const cleanUrl = remoteUrl.replace(/\/+$/, '');
        const result = await window.__electron?.setServerMode?.(serverMode, {
          remoteUrl: cleanUrl,
          useLocalCompute: serverMode === 'hybrid'
        });
        
        // Also update API base for immediate use
        await window.__electron?.setApiBase?.(cleanUrl);
        
        if (result?.ok) {
          alert('服务器设置已保存。需要重启应用以生效。');
        } else {
          alert('保存失败');
        }
      }
    } catch (e) {
      alert('保存出错: ' + (e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  // Switch back to local server
  const switchToLocal = async () => {
    setServerMode('local');
    setRemoteUrl('');
    setServerInfo(null);
    
    if (isElectron) {
      // Use setServerMode API - it will clear apiBase automatically
      if (window.__electron?.setServerMode) {
        await window.__electron.setServerMode('local', { useLocalCompute: true });
      }
      // Note: Don't call setApiBase here - local mode uses dynamic port
      
      // Test local connection using current port
      const localUrl = `http://127.0.0.1:${currentPort}`;
      try {
        const res = await fetch(`${localUrl}/api/discover`);
        if (res.ok) {
          const data = await res.json();
          setServerInfo(data);
        }
      } catch (e) {
        console.warn('Local server not responding:', e);
      }
    }
  };

  return (
    <div className="card" style={{ padding: 16, marginBottom: 16 }}>
      <h3>🌐 服务器连接设置</h3>
      <p style={{ color: '#555', marginBottom: 16 }}>
        选择数据存储位置。可以使用本地服务器，或连接到远程 NAS 服务器。
      </p>
      
      {/* Mode Selection */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 8, 
          marginBottom: 8,
          padding: '12px 16px',
          background: serverMode === 'local' ? '#e8f5e9' : '#f5f5f5',
          borderRadius: 8,
          cursor: 'pointer',
          border: serverMode === 'local' ? '2px solid #4caf50' : '1px solid #ddd'
        }}>
          <input 
            type="radio" 
            name="serverMode" 
            value="local"
            checked={serverMode === 'local'}
            onChange={() => setServerMode('local')}
          />
          <div>
            <div style={{ fontWeight: 600 }}>💻 本地服务器</div>
            <div style={{ fontSize: 13, color: '#666' }}>
              数据存储在本机，FilmLab 使用本地 GPU 处理
            </div>
          </div>
        </label>
        
        <label style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 8,
          marginBottom: 8,
          padding: '12px 16px',
          background: serverMode === 'remote' ? '#e3f2fd' : '#f5f5f5',
          borderRadius: 8,
          cursor: 'pointer',
          border: serverMode === 'remote' ? '2px solid #2196f3' : '1px solid #ddd'
        }}>
          <input 
            type="radio" 
            name="serverMode" 
            value="remote"
            checked={serverMode === 'remote'}
            onChange={() => setServerMode('remote')}
          />
          <div>
            <div style={{ fontWeight: 600 }}>🌐 远程服务器</div>
            <div style={{ fontSize: 13, color: '#666' }}>
              连接到 NAS 或远程服务器，所有操作在远端执行
            </div>
          </div>
        </label>
        
        <label style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 8,
          padding: '12px 16px',
          background: serverMode === 'hybrid' ? '#fff3e0' : '#f5f5f5',
          borderRadius: 8,
          cursor: 'pointer',
          border: serverMode === 'hybrid' ? '2px solid #ff9800' : '1px solid #ddd'
        }}>
          <input 
            type="radio" 
            name="serverMode" 
            value="hybrid"
            checked={serverMode === 'hybrid'}
            onChange={() => setServerMode('hybrid')}
          />
          <div>
            <div style={{ fontWeight: 600 }}>⚡ 混合模式 (推荐)</div>
            <div style={{ fontSize: 13, color: '#666' }}>
              数据存储在 NAS，FilmLab 使用本地 PC 的 GPU 处理
            </div>
          </div>
        </label>
      </div>
      
      {/* Remote URL Input */}
      {(serverMode === 'remote' || serverMode === 'hybrid') && (
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
            远程服务器地址
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={remoteUrl}
              onChange={(e) => setRemoteUrl(e.target.value)}
              placeholder="http://192.168.1.100:4000"
              style={{
                flex: 1,
                padding: '8px 12px',
                border: '1px solid #ddd',
                borderRadius: 4,
                fontSize: 14
              }}
            />
            <button 
              onClick={() => testConnection(remoteUrl)}
              disabled={!remoteUrl || testStatus === 'testing'}
              style={{
                padding: '8px 16px',
                background: '#f0f0f0',
                border: '1px solid #ddd',
                borderRadius: 4,
                cursor: 'pointer'
              }}
            >
              {testStatus === 'testing' ? '测试中...' : '测试连接'}
            </button>
          </div>
          
          {/* Test Result */}
          {testStatus === 'success' && (
            <div style={{ 
              marginTop: 8, 
              padding: 8, 
              background: '#e8f5e9', 
              borderRadius: 4,
              fontSize: 13,
              color: '#2e7d32'
            }}>
              ✅ 连接成功！
              {serverInfo && (
                <span style={{ marginLeft: 8 }}>
                  服务器版本: {serverInfo.version} | 模式: {serverInfo.mode || 'standalone'}
                </span>
              )}
            </div>
          )}
          {testStatus === 'error' && (
            <div style={{ 
              marginTop: 8, 
              padding: 8, 
              background: '#ffebee', 
              borderRadius: 4,
              fontSize: 13,
              color: '#c62828'
            }}>
              ❌ 连接失败，请检查地址和网络
            </div>
          )}
        </div>
      )}
      
      {/* Hybrid Mode Info */}
      {serverMode === 'hybrid' && (
        <div style={{ 
          marginBottom: 16, 
          padding: 12, 
          background: '#fff8e1', 
          borderRadius: 8,
          border: '1px solid #ffe082'
        }}>
          <div style={{ fontWeight: 500, marginBottom: 8 }}>⚡ 混合模式说明</div>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: '#555' }}>
            <li>相册数据存储在远程 NAS 服务器</li>
            <li>FilmLab 图像处理使用本地 PC 的 GPU</li>
            <li>Mobile/Watch 自动连接 NAS 服务器</li>
            <li>需要 NAS 和 PC 处于同一网络</li>
          </ul>
        </div>
      )}
      
      {/* Current Connection Status */}
      <div style={{ 
        marginBottom: 16, 
        padding: 12, 
        background: '#f5f5f5', 
        borderRadius: 8 
      }}>
        <div style={{ fontWeight: 500, marginBottom: 8 }}>当前连接状态</div>
        <div style={{ fontSize: 13, color: '#555' }}>
          <div>
            <strong>API 地址:</strong>{' '}
            <code style={{ background: '#e0e0e0', padding: '2px 6px', borderRadius: 3 }}>
              {currentApiBase}
            </code>
          </div>
          {serverInfo && (
            <>
              <div style={{ marginTop: 4 }}>
                <strong>服务器模式:</strong> {serverInfo.mode || 'standalone'}
              </div>
              <div style={{ marginTop: 4 }}>
                <strong>版本:</strong> {serverInfo.version}
              </div>
              {serverInfo.capabilities && (
                <div style={{ marginTop: 4 }}>
                  <strong>功能:</strong>{' '}
                  {serverInfo.capabilities.database && '📁 数据库 '}
                  {serverInfo.capabilities.files && '📂 文件 '}
                  {serverInfo.capabilities.compute && '⚡ 算力 '}
                  {!serverInfo.capabilities.compute && '❌ 无算力'}
                </div>
              )}
            </>
          )}
        </div>
      </div>
      
      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: 8 }}>
        {serverMode !== 'local' ? (
          <>
            <button
              onClick={saveServerConfig}
              disabled={saving || !remoteUrl}
              style={{
                padding: '10px 20px',
                background: '#5a4632',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                fontWeight: 500
              }}
            >
              {saving ? '保存中...' : '保存设置'}
            </button>
            <button
              onClick={switchToLocal}
              style={{
                padding: '10px 20px',
                background: '#f0f0f0',
                border: '1px solid #ddd',
                borderRadius: 4,
                cursor: 'pointer'
              }}
            >
              切换回本地
            </button>
          </>
        ) : (
          <button
            onClick={saveServerConfig}
            disabled={saving}
            style={{
              padding: '10px 20px',
              background: '#5a4632',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              fontWeight: 500
            }}
          >
            {saving ? '保存中...' : '确认使用本地服务器'}
          </button>
        )}
      </div>
      
      {/* Restart Notice */}
      <div style={{ 
        marginTop: 12, 
        fontSize: 12, 
        color: '#888' 
      }}>
        💡 更改服务器设置后需要重启应用才能生效
      </div>
    </div>
  );
}
