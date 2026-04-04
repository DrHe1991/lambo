import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Zap } from 'lucide-react';

const STEPS = [0, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000];

interface BountySliderProps {
  value: number;
  onChange: (value: number) => void;
}

function fracToStepIndex(frac: number): number {
  const clamped = Math.max(0, Math.min(1, frac));
  return Math.round(clamped * (STEPS.length - 1));
}

function stepIndexToFrac(idx: number): number {
  return idx / (STEPS.length - 1);
}

function valueToStepIndex(val: number): number {
  let best = 0;
  let bestDist = Math.abs(val - STEPS[0]);
  for (let i = 1; i < STEPS.length; i++) {
    const dist = Math.abs(val - STEPS[i]);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

export const BountySlider: React.FC<BountySliderProps> = ({ value, onChange }) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [liveIdx, setLiveIdx] = useState(() => valueToStepIndex(value));
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!dragging) {
      setLiveIdx(valueToStepIndex(value));
    }
  }, [value, dragging]);

  const getStepFromX = useCallback((clientX: number): number => {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return fracToStepIndex(frac);
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      setDragging(true);
      setLiveIdx(getStepFromX(e.touches[0].clientX));
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!dragging) return;
      e.preventDefault();
      setLiveIdx(getStepFromX(e.touches[0].clientX));
    };

    const onTouchEnd = () => {
      if (!dragging) return;
      setDragging(false);
      onChange(STEPS[liveIdx]);
    };

    track.addEventListener('touchstart', onTouchStart, { passive: false });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      track.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
    };
  }, [dragging, liveIdx, getStepFromX, onChange]);

  useEffect(() => {
    if (!dragging) return;

    const onMouseMove = (e: MouseEvent) => {
      setLiveIdx(getStepFromX(e.clientX));
    };

    const onMouseUp = () => {
      setDragging(false);
      onChange(STEPS[liveIdx]);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [dragging, liveIdx, getStepFromX, onChange]);

  const handleMouseDown = (e: React.MouseEvent) => {
    setDragging(true);
    setLiveIdx(getStepFromX(e.clientX));
  };

  const currentIdx = dragging ? liveIdx : valueToStepIndex(value);
  const displayValue = dragging ? STEPS[liveIdx] : value;
  const fillPercent = stepIndexToFrac(currentIdx) * 100;

  const startEditing = () => {
    setEditText(value > 0 ? String(value) : '');
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const commitEdit = () => {
    setEditing(false);
    const parsed = parseInt(editText);
    if (!isNaN(parsed) && parsed >= 0) {
      onChange(Math.min(parsed, 1000000));
    }
  };

  const formatDisplay = (v: number): string => {
    if (v >= 1000000) return `${(v / 1000000).toFixed(v % 1000000 === 0 ? 0 : 1)}M`;
    if (v >= 1000) return `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}K`;
    return String(v);
  };

  return (
    <div className="mt-3 p-4 bg-blue-500/10 border border-blue-500/30 rounded-2xl">
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <Zap size={14} className="text-blue-400" />
          <span className="text-sm font-bold text-blue-400">Bounty</span>
          <span className="text-xs text-stone-400 ml-1">optional</span>
        </div>

        {editing ? (
          <div className="flex items-center gap-1">
            <input
              ref={inputRef}
              type="number"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); }}
              className="w-20 bg-stone-900 border border-blue-500/40 rounded-lg px-2 py-1 text-right text-sm font-bold text-white outline-none"
              placeholder="0"
              min={0}
            />
            <span className="text-xs font-bold uppercase text-blue-400">sat</span>
          </div>
        ) : (
          <button
            onClick={startEditing}
            className="flex items-center gap-1 active:opacity-70 transition-opacity"
          >
            <span className="text-xl font-bold text-white tabular-nums">
              {formatDisplay(displayValue)}
            </span>
            <span className="text-xs font-bold uppercase text-blue-400">sat</span>
          </button>
        )}
      </div>

      {/* Slider track */}
      <div
        ref={trackRef}
        className="relative h-8 cursor-pointer select-none"
        onMouseDown={handleMouseDown}
      >
        {/* Background track */}
        <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-2.5 rounded-full bg-stone-800 overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{
              width: `${fillPercent}%`,
              background: 'linear-gradient(90deg, #3b82f6, #60a5fa)',
              boxShadow: fillPercent > 0 ? '0 0 12px rgba(59, 130, 246, 0.4)' : 'none',
              transition: 'width 0.15s cubic-bezier(0.25, 1, 0.5, 1)',
            }}
          />
        </div>

        {/* Thumb */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-white border-2 border-blue-500"
          style={{
            left: `calc(${fillPercent}% - 10px)`,
            transition: 'left 0.15s cubic-bezier(0.25, 1, 0.5, 1)',
            boxShadow: '0 0 8px rgba(59, 130, 246, 0.3), 0 2px 4px rgba(0,0,0,0.3)',
          }}
        />
      </div>
    </div>
  );
};
