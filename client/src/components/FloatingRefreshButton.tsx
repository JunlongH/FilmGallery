import React from 'react';

interface FloatingRefreshButtonProps {
  onRefresh: () => void;
}

function FloatingRefreshButton({ onRefresh }: FloatingRefreshButtonProps): React.JSX.Element {
  return (
    <button 
      className="floating-refresh-btn" 
      onClick={onRefresh}
      title="强制刷新并清除缓存"
      aria-label="刷新"
    >
      <svg 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="2" 
        strokeLinecap="round" 
        strokeLinejoin="round"
      >
        <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
      </svg>
    </button>
  );
}

export default FloatingRefreshButton;
