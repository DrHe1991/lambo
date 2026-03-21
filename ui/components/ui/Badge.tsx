import React from 'react';

type BadgeVariant = 'orange' | 'green' | 'red' | 'yellow' | 'purple' | 'blue';

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  orange: 'bg-orange-500/10 text-orange-500 border-orange-500/30',
  green: 'bg-green-500/10 text-green-500 border-green-500/30',
  red: 'bg-red-500/10 text-red-500 border-red-500/30',
  yellow: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30',
  purple: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  blue: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
};

export const Badge: React.FC<BadgeProps> = ({
  variant = 'orange',
  children,
  className = '',
}) => {
  return (
    <span
      className={`inline-flex items-center gap-1 border text-xs font-bold px-2 py-0.5 rounded-full ${variantStyles[variant]} ${className}`}
    >
      {children}
    </span>
  );
};
