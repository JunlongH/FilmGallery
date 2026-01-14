import React from 'react';
// @ts-ignore - SVG import handled by Webpack/CRA
import logo from '../logo.svg';

// Use type assertion to access electron methods
interface ElectronAPI {
  API_BASE?: string;
  minimize?: () => void;
  maximize?: () => void;
  close?: () => void;
}

export default function TitleBar(): React.JSX.Element {
  const electron = window.__electron as ElectronAPI | undefined;

  const handleMinimize = () => {
    if (electron?.minimize) electron.minimize();
  };

  const handleMaximize = () => {
    if (electron?.maximize) electron.maximize();
  };

  const handleClose = () => {
    if (electron?.close) electron.close();
  };

  return (
    <div className="title-bar">
      <div className="title-bar-title">
        <img src={logo} alt="" className="title-bar-icon" />
        Film Gallery
      </div>
      <div className="window-controls">
        <button className="control-btn minimize-btn" onClick={handleMinimize} title="Minimize">
          <svg width="10" height="1" viewBox="0 0 10 1"><path d="M0 0h10v1H0z" fill="currentColor"/></svg>
        </button>
        <button className="control-btn maximize-btn" onClick={handleMaximize} title="Maximize">
          <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1 1h8v8H1z" fill="none" stroke="currentColor" strokeWidth="1"/></svg>
        </button>
        <button className="control-btn close-btn" onClick={handleClose} title="Close">
          <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1 1l8 8m0-8l-8 8" stroke="currentColor" strokeWidth="1.2"/></svg>
        </button>
      </div>
    </div>
  );
}
