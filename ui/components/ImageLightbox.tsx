import { X } from 'lucide-react';
import { useEffect, useCallback, useState, useRef } from 'react';
import { createPortal } from 'react-dom';

interface ImageLightboxProps {
  src: string;
  onClose: () => void;
}

export default function ImageLightbox({ src, onClose }: ImageLightboxProps) {
  const [scale, setScale] = useState(1);
  const imgRef = useRef<HTMLImageElement>(null);
  const [corner, setCorner] = useState({ top: 0, right: 0 });

  const updateCorner = useCallback(() => {
    const img = imgRef.current;
    if (!img) return;
    // Measure the un-transformed layout box so zoom doesn't move the button.
    const prev = img.style.transform;
    img.style.transform = 'none';
    const r = img.getBoundingClientRect();
    img.style.transform = prev;
    setCorner({
      top: Math.max(0, r.top),
      right: Math.max(0, window.innerWidth - r.right),
    });
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    window.addEventListener('resize', updateCorner);
    window.addEventListener('orientationchange', updateCorner);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
      window.removeEventListener('resize', updateCorner);
      window.removeEventListener('orientationchange', updateCorner);
    };
  }, [handleKeyDown, updateCorner]);

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
        className="absolute z-10 w-12 h-12 rounded-full bg-black/60 backdrop-blur-md ring-1 ring-white/20 flex items-center justify-center active:bg-black/80 shadow-lg"
        style={{
          top: `max(calc(env(safe-area-inset-top, 0px) + 0.5rem), ${corner.top + 8}px)`,
          right: `max(calc(env(safe-area-inset-right, 0px) + 0.5rem), ${corner.right + 8}px)`,
        }}
        aria-label="Close image"
      >
        <X size={22} className="text-white" strokeWidth={2.5} />
      </button>

      <img
        ref={imgRef}
        src={src}
        alt=""
        onClick={(e) => {
          e.stopPropagation();
          toggleZoom();
        }}
        onLoad={updateCorner}
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
