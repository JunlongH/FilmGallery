import React from 'react';
import ReactDOM from 'react-dom';

export interface ModalDialogProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Type of modal - alert (single button) or confirm (two buttons) */
  type?: 'alert' | 'confirm';
  /** Modal title */
  title?: string;
  /** Modal message content */
  message: React.ReactNode;
  /** Callback when confirm button is clicked */
  onConfirm: () => void;
  /** Callback when cancel button is clicked (for confirm type) */
  onCancel?: () => void;
  /** Text for confirm button */
  confirmText?: string;
  /** Text for cancel button */
  cancelText?: string;
}

const ModalDialog: React.FC<ModalDialogProps> = ({
  isOpen,
  type = 'alert',
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = 'OK',
  cancelText = 'Cancel'
}) => {
  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 11000
    }}>
      <div style={{
        backgroundColor: '#222',
        border: '1px solid #444',
        borderRadius: 8,
        padding: 24,
        minWidth: 300,
        maxWidth: 400,
        boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
        color: '#eee'
      }}>
        {title && <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: 18 }}>{title}</h3>}
        <div style={{ marginBottom: 24, fontSize: 14, lineHeight: 1.5, color: '#ccc' }}>
          {message}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          {type === 'confirm' && (
            <button 
              onClick={onCancel}
              style={{
                background: 'transparent',
                border: '1px solid #555',
                color: '#ccc',
                padding: '6px 16px',
                borderRadius: 4,
                cursor: 'pointer'
              }}
            >
              {cancelText}
            </button>
          )}
          <button 
            onClick={onConfirm}
            style={{
              background: '#007acc',
              border: 'none',
              color: '#fff',
              padding: '6px 16px',
              borderRadius: 4,
              cursor: 'pointer',
              fontWeight: 500
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ModalDialog;
