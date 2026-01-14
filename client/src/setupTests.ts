// jest-dom adds custom jest matchers for asserting on DOM nodes.
import '@testing-library/jest-dom';

// Mock window.electron for Electron API
(global as any).window = {
  ...global.window,
  __electron: {
    API_BASE: 'http://localhost:4000',
    platform: 'test'
  }
};
