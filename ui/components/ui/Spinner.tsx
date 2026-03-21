import React from 'react';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  variant?: 'brand' | 'white';
  className?: string;
}

const sizeStyles = {
  sm: 'w-4 h-4 border-2',
  md: 'w-6 h-6 border-2',
  lg: 'w-8 h-8 border-2',
};

const variantStyles = {
  brand: 'border-orange-500/30 border-t-orange-500',
  white: 'border-white/30 border-t-white',
};

export const Spinner: React.FC<SpinnerProps> = ({
  size = 'md',
  variant = 'brand',
  className = '',
}) => {
  return (
    <div
      className={`rounded-full animate-spin ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
    />
  );
};
