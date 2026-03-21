import React from 'react';
import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  message: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  message,
  action,
  className = '',
}) => {
  return (
    <div className={`text-center py-8 ${className}`}>
      <Icon className="w-10 h-10 text-stone-600 mx-auto mb-3" />
      <p className="text-stone-500 text-sm">{message}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-3 text-orange-500 text-sm font-medium hover:text-orange-400 transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  );
};
