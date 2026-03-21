import React from 'react';

interface ToggleOption {
  value: string;
  label: string;
}

interface ToggleProps {
  options: ToggleOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export const Toggle: React.FC<ToggleProps> = ({
  options,
  value,
  onChange,
  className = '',
}) => {
  return (
    <div className={`flex bg-stone-900 rounded-lg p-1 ${className}`}>
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
            value === option.value
              ? 'bg-orange-500 text-white'
              : 'text-stone-400'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
};
