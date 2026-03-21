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
    <div className={`p-4 sticky top-0 z-10 bg-black/90 backdrop-blur-xl border-b border-stone-800 flex items-center gap-4 ${className}`}>
      {onBack && (
        <button
          onClick={onBack}
          className="p-1 -ml-1 text-stone-400 hover:text-white transition-colors"
          aria-label="Go back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
      )}
      <h1 className="font-bold text-white flex-1">{title}</h1>
      {rightContent && <div className="flex items-center gap-2">{rightContent}</div>}
    </div>
  );
};
