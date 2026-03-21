import React, { useEffect, useState, useCallback } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  position?: 'center' | 'bottom';
}

const sizeStyles = {
  sm: 'max-w-xs',
  md: 'max-w-sm',
  lg: 'max-w-md',
};

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  children,
  size = 'md',
  position = 'center',
}) => {
  const [visible, setVisible] = useState(false);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setVisible(true);
      requestAnimationFrame(() => setAnimating(true));
    } else {
      setAnimating(false);
      const timer = setTimeout(() => setVisible(false), 200);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleBackdropClick = useCallback(() => {
    onClose();
  }, [onClose]);

  if (!visible) return null;

  if (position === 'bottom') {
    return (
      <div className="fixed inset-0 z-[60] flex items-end">
        <div
          className={`absolute inset-0 overlay-dim backdrop-blur-sm transition-opacity duration-200 ${animating ? 'opacity-100' : 'opacity-0'}`}
          onClick={handleBackdropClick}
        />
        <div
          className={`relative w-full bg-stone-900 rounded-t-3xl p-4 transition-transform duration-200 ${animating ? 'translate-y-0' : 'translate-y-full'}`}
        >
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className={`absolute inset-0 overlay-dim backdrop-blur-sm transition-opacity duration-200 ${animating ? 'opacity-100' : 'opacity-0'}`}
        onClick={handleBackdropClick}
      />
      <div
        className={`relative bg-stone-900 border border-stone-800 rounded-2xl p-6 w-full ${sizeStyles[size]} shadow-2xl
          transition-all duration-200 ${animating ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
      >
        {children}
      </div>
    </div>
  );
};
