import React from 'react';
import { getTrustBadgeClass } from '../trustTheme';

interface TrustBadgeProps {
  score: number; // 0-100 scale, will be displayed as 0-1000
  size?: 'sm' | 'md' | 'lg';
}

export const TrustBadge: React.FC<TrustBadgeProps> = ({ score, size = 'sm' }) => {
  // Convert to 0-1000 display scale
  const displayScore = score * 10;
  
  const getColor = (s: number) => {
    // s is 0-100 scale
    return getTrustBadgeClass(s);
  };

  const sizeClasses = {
    sm: 'text-[10px] px-1 py-0.5 border',
    md: 'text-xs px-2 py-1 border',
    lg: 'text-sm px-3 py-1.5 border-2'
  };

  return (
    <div className={`inline-flex items-center rounded-full font-bold ${getColor(score)} ${sizeClasses[size]}`}>
      TS {displayScore}
    </div>
  );
};
