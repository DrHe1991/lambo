import { useState } from 'react';
import ImageLightbox from './ImageLightbox';

interface ImageGridProps {
  urls: string[];
}

export default function ImageGrid({ urls }: ImageGridProps) {
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  if (!urls.length) return null;

  const count = urls.length;

  return (
    <>
      <div
        className={`mt-2 rounded-xl overflow-hidden ${
          count === 1
            ? ''
            : count === 2
              ? 'grid grid-cols-2 gap-0.5'
              : count === 3
                ? 'grid grid-cols-2 gap-0.5'
                : 'grid grid-cols-2 gap-0.5'
        }`}
      >
        {urls.slice(0, 4).map((url, i) => {
          const isLastWithMore = i === 3 && count > 4;
          const isTallLeft = count === 3 && i === 0;

          return (
            <div
              key={url}
              className={`relative cursor-pointer overflow-hidden bg-neutral-800 ${
                count === 1
                  ? 'max-h-80'
                  : isTallLeft
                    ? 'row-span-2'
                    : 'aspect-square'
              }`}
              onClick={() => setLightboxSrc(url)}
            >
              <img
                src={url}
                alt=""
                className={`w-full h-full object-cover ${count === 1 ? 'max-h-80' : ''}`}
                loading="lazy"
              />
              {isLastWithMore && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <span className="text-white text-2xl font-bold">+{count - 4}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {lightboxSrc && (
        <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      )}
    </>
  );
}
