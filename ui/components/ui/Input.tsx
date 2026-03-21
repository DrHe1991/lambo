import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
  label?: string;
}

interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string;
  label?: string;
}

export const Input: React.FC<InputProps> = ({
  error,
  label,
  className = '',
  ...props
}) => {
  return (
    <div>
      {label && <label className="block text-xs text-stone-400 mb-1.5">{label}</label>}
      <input
        className={`
          w-full bg-stone-800 border text-white py-3 px-4 rounded-xl text-sm
          outline-none transition-colors
          ${error ? 'border-red-500 focus:border-red-500' : 'border-stone-700 focus:border-orange-500'}
          ${className}
        `.trim().replace(/\s+/g, ' ')}
        {...props}
      />
      {error && <p className="text-red-400 text-xs mt-1.5">{error}</p>}
    </div>
  );
};

export const TextArea: React.FC<TextAreaProps> = ({
  error,
  label,
  className = '',
  ...props
}) => {
  return (
    <div>
      {label && <label className="block text-xs text-stone-400 mb-1.5">{label}</label>}
      <textarea
        className={`
          w-full bg-stone-800 border text-white py-3 px-4 rounded-xl text-sm
          outline-none resize-none transition-colors
          ${error ? 'border-red-500 focus:border-red-500' : 'border-stone-700 focus:border-orange-500'}
          ${className}
        `.trim().replace(/\s+/g, ' ')}
        {...props}
      />
      {error && <p className="text-red-400 text-xs mt-1.5">{error}</p>}
    </div>
  );
};
