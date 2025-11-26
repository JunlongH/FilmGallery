import React from 'react';
import logo from '../logo.svg';

export default function TitleBar() {
  const handleMinimize = () => {
    if (window.__electron) window.__electron.minimize();
  };

  const handleMaximize = () => {
    if (window.__electron) window.__electron.maximize();
  };

  const handleClose = () => {
    if (window.__electron) window.__electron.close();
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
