import React, { useState } from 'react';
import { Database, Folder, Shield, Smartphone, HardDrive, Info, AlertTriangle } from 'lucide-react';

export default function GeneralSettings({ 
  config, 
  serverInfo, 
  actualPaths, 
  isElectron, 
  isRemoteServer,
  onChooseDataRoot,
  onChooseUploadsRoot,
  onToggleWriteThrough
}) {
  const [savingDir, setSavingDir] = useState(false);
  const [savingWrite, setSavingWrite] = useState(false);

  // Wrap handlers to manage local loading state
  const handleChooseDataRoot = async () => {
    setSavingDir(true);
    await onChooseDataRoot();
    setSavingDir(false);
  };

  const handleChooseUploadsRoot = async () => {
    setSavingDir(true);
    await onChooseUploadsRoot();
    setSavingDir(false);
  };

  const handleToggleWriteThrough = async (e) => {
    setSavingWrite(true);
    await onToggleWriteThrough(e.target.checked);
    setSavingWrite(false);
  };

  const Section = ({ title, icon: Icon, children, className = "" }) => (
    <div className={`bg-card border border-divider rounded-xl p-6 ${className}`}>
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        {Icon && <Icon className="w-5 h-5 text-primary" />}
        {title}
      </h3>
      {children}
    </div>
  );

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-in fade-in duration-500">
      
      {/* Mobile/Watch Connection Info (Electron Only) */}
      {isElectron && (
        <Section title="Mobile & Watch Connection" icon={Smartphone} className="bg-primary/5 border-primary/20">
          <p className="text-default-500 mb-4 text-sm">
            Use the following information to connect your Mobile or Watch app to this PC.
          </p>
          <div className="flex flex-wrap gap-4">
            <div className="bg-background rounded-lg border border-divider p-3 min-w-[120px]">
              <div className="text-xs text-default-500 uppercase tracking-wider mb-1">Port</div>
              <div className="text-xl font-bold font-mono">
                {window.__electron?.SERVER_PORT || 4000}
              </div>
            </div>
            <div className="bg-background rounded-lg border border-divider p-3 flex-1 min-w-[200px]">
              <div className="text-xs text-default-500 uppercase tracking-wider mb-1">API Address</div>
              <code className="text-sm font-mono text-foreground break-all">
                {window.__electron?.API_BASE || 'http://127.0.0.1:4000'}
              </code>
            </div>
          </div>
          <div className="mt-4 flex gap-2 text-sm text-primary/80 bg-background/50 p-2 rounded border border-primary/10">
            <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <p>On your mobile device, enter this computer's IP address. The app will automatically discover the service port.</p>
          </div>
        </Section>
      )}

      {!isElectron && (
        <div className="bg-content2 text-default-500 p-4 rounded-xl border border-divider text-center text-sm">
          Storage path settings are managed by the host environment (Docker/Server).
        </div>
      )}

      {/* Remote Server Storage Info (Read Only) */}
      {isRemoteServer && (
        <Section title="Remote Storage" icon={HardDrive}>
          <div className="mb-4 text-sm text-default-500">
            Connected to remote server. Storage paths are managed by the server configuration.
          </div>
          
          {actualPaths && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-content2 p-3 rounded-lg border border-divider">
                <div className="text-xs text-default-500 mb-1">Database Location</div>
                <code className="text-xs font-mono break-all">{actualPaths.databasePath}</code>
              </div>
              <div className="bg-content2 p-3 rounded-lg border border-divider">
                <div className="text-xs text-default-500 mb-1">Photos Location</div>
                <code className="text-xs font-mono break-all">{actualPaths.uploadsDir}</code>
              </div>
            </div>
          )}
          
          {serverInfo && (
            <div className="mt-4 flex gap-6 text-sm text-default-600 border-t border-divider pt-4">
              <div>
                <span className="text-default-400 mr-2">Mode:</span>
                <span className="font-medium">{serverInfo.serverMode || 'unknown'}</span>
              </div>
              <div>
                <span className="text-default-400 mr-2">Version:</span>
                <span className="font-medium">{serverInfo.version || 'unknown'}</span>
              </div>
            </div>
          )}
          
          <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-sm text-yellow-600 dark:text-yellow-400 flex gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <p>To change storage paths, please edit the <code>docker-compose.yml</code> volume configuration on your NAS/Server.</p>
          </div>
        </Section>
      )}

      {/* Local Data Location */}
      {!isRemoteServer && (
        <Section title="Data Storage Location" icon={Database}>
          <p className="text-default-500 text-sm mb-4">
            Choose where the database (film.db) and uploaded photos are stored. 
            Moving this to a <strong>OneDrive</strong> or <strong>Dropbox</strong> folder enables syncing across devices.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center p-4 bg-content2/50 rounded-lg border border-divider">
            <div className="flex-1 min-w-0">
              <div className="text-xs text-default-500 mb-1">Current Root Path</div>
              <code className="text-sm font-mono block truncate" title={config.dataRoot}>
                {config.dataRoot || '(Default) %APPDATA%/FilmGallery'}
              </code>
            </div>
            <button 
              onClick={handleChooseDataRoot}
              disabled={savingDir}
              className="px-4 py-2 bg-background border border-divider text-foreground rounded-lg hover:bg-content2 transition-colors text-sm font-medium whitespace-nowrap shadow-sm"
            >
              {savingDir ? 'Moving...' : 'Change Location...'}
            </button>
          </div>

          {actualPaths && (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-default-500">
              <div className="flex gap-2">
                <span className="font-medium">DB:</span> 
                <span className="truncate" title={actualPaths.databasePath}>{actualPaths.databasePath}</span>
              </div>
              <div className="flex gap-2">
                <span className="font-medium">Files:</span> 
                <span className="truncate" title={actualPaths.uploadsDir}>{actualPaths.uploadsDir}</span>
              </div>
            </div>
          )}
        </Section>
      )}

      {/* Write-Through Mode */}
      {!isRemoteServer && (
        <Section title="Cloud Sync Optimization" icon={Shield}>
          <div className="flex items-start gap-4">
            <div className="flex-1">
              <h4 className="font-medium text-foreground">Database Write-through</h4>
              <p className="text-sm text-default-500 mt-1">
                Enable this if you are syncing your database via OneDrive/Dropbox. 
                It forces safer file operations (TRUNCATE mode) to prevent sync conflicts, 
                though it may be slightly slower.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                className="sr-only peer"
                checked={!!config.writeThrough}
                onChange={handleToggleWriteThrough}
                disabled={savingWrite}
              />
              <div className="w-11 h-6 bg-default-200 peer-focus:outline-none ring-offset-background rounded-full peer dark:bg-default-100 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary"></div>
            </label>
          </div>
        </Section>
      )}

      {/* Legacy Uploads Root */}
      {!isRemoteServer && (
        <Section title="Legacy Images Location" icon={Folder} className="opacity-80">
          <div className="flex justify-between items-center">
             <div>
                <p className="text-sm text-default-500">
                  Override only the uploads folder. Not recommended if you are using the Data Storage Location setting above.
                </p>
             </div>
             <button 
                onClick={handleChooseUploadsRoot}
                disabled={savingDir}
                className="ml-4 px-3 py-1.5 text-xs bg-transparent border border-divider text-default-600 rounded hover:bg-content2 transition-colors"
              >
                Change Path
              </button>
          </div>
          <div className="mt-2">
             <code className="text-xs bg-content2 px-2 py-1 rounded text-default-500">
                {config.uploadsRoot || '(Default)'}
             </code>
          </div>
        </Section>
      )}

    </div>
  );
}