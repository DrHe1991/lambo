import { X } from 'lucide-react';
import { useEffect, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';

interface ImageLightboxProps {
  src: string;
  onClose: () => void;
}

export default function ImageLightbox({ src, onClose }: ImageLightboxProps) {
  const [scale, setScale] = useState(1);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [handleKeyDown]);

  const toggleZoom = () => {
    setScale(s => s === 1 ? 2 : 1);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-black/95 flex items-center justify-center"
      onClick={onClose}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center active:bg-white/20"
      >
        <X size={22} className="text-white" />
      </button>

      <img
        src={src}
        alt=""
        onClick={(e) => {
          e.stopPropagation();
          toggleZoom();
        }}
        className="max-w-full max-h-full object-contain transition-transform duration-200"
        style={{
          transform: `scale(${scale})`,
          touchAction: 'manipulation',
        }}
        draggable={false}
      />
    </div>,
    document.body
  );
}
