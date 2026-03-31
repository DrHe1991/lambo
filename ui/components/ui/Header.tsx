import React from 'react';
import { ArrowLeft } from 'lucide-react';

interface HeaderProps {
  title: string;
  onBack?: () => void;
  rightContent?: React.ReactNode;
  className?: string;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  onBack,
  rightContent,
  className = '',
}) => {
  return (
    <div className={`sticky top-0 z-10 bg-stone-950/95 backdrop-blur-xl px-5 py-1.5 flex items-center gap-3 top-nav ${className}`}>
      {onBack && (
        <button
          onClick={onBack}
          className="p-2.5 -ml-2.5 rounded-full hover:bg-stone-800/60 transition-colors"
          aria-label="Go back"
        >
          <ArrowLeft size={20} />
        </button>
      )}
      <span className="text-[19px] text-white select-none font-display font-bold tracking-tight flex-1">{title}</span>
      {rightContent && <div className="flex items-center gap-2">{rightContent}</div>}
    </div>
  );
};
