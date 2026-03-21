import React from 'react';
import { AlertCircle } from 'lucide-react';

interface ErrorMessageProps {
  message: string;
  onDismiss?: () => void;
  className?: string;
}

export const ErrorMessage: React.FC<ErrorMessageProps> = ({
  message,
  onDismiss,
  className = '',
}) => {
  return (
    <div className={`bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex items-center gap-2 ${className}`}>
      <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
      <p className="text-red-400 text-sm flex-1">{message}</p>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="text-red-300 text-xs underline shrink-0"
        >
          Dismiss
        </button>
      )}
    </div>
  );
};
