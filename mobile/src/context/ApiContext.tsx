/**
 * API Context for global configuration
 * 
 * Provides app-wide access to:
 * - baseUrl: Primary API server URL
 * - backupUrl: Fallback API server URL
 * - darkMode: Theme preference
 */

import React from 'react';

export interface ApiContextType {
  baseUrl: string;
  setBaseUrl: (url: string) => void;
  backupUrl: string;
  setBackupUrl: (url: string) => void;
  darkMode: boolean;
  setDarkMode: (enabled: boolean) => void;
}

const defaultValue: ApiContextType = {
  baseUrl: '',
  setBaseUrl: () => {},
  backupUrl: '',
  setBackupUrl: () => {},
  darkMode: false,
  setDarkMode: () => {},
};

export const ApiContext = React.createContext<ApiContextType>(defaultValue);
