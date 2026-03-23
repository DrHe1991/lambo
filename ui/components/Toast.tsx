import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, Info, X, XCircle } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
  onConfirm?: () => void;
  confirmText?: string;
}

const iconMap: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle size={18} className="text-green-400 flex-shrink-0" />,
  error: <XCircle size={18} className="text-red-400 flex-shrink-0" />,
  warning: <AlertTriangle size={18} className="text-amber-400 flex-shrink-0" />,
  info: <Info size={18} className="text-blue-400 flex-shrink-0" />,
};

const bgMap: Record<ToastType, string> = {
  success: 'border-green-500/30 bg-green-500/10',
  error: 'border-red-500/30 bg-red-500/10',
  warning: 'border-amber-500/30 bg-amber-500/10',
  info: 'border-blue-500/30 bg-blue-500/10',
};

// Global toast state
let toastListeners: Array<(toasts: ToastItem[]) => void> = [];
let toasts: ToastItem[] = [];

function notify() {
  toastListeners.forEach((fn) => fn([...toasts]));
}

export const toast = {
  show: (type: ToastType, message: string, duration = 3000, options?: { onConfirm?: () => void; confirmText?: string }) => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    toasts = [...toasts, { id, type, message, duration, ...options }];
    notify();
    if (duration > 0) {
      setTimeout(() => {
        toasts = toasts.filter((t) => t.id !== id);
        notify();
      }, duration);
    }
    return id;
  },
  success: (msg: string, duration?: number) => toast.show('success', msg, duration),
  error: (msg: string, duration?: number) => toast.show('error', msg, duration ?? 4000),
  warning: (msg: string, duration?: number) => toast.show('warning', msg, duration ?? 4000),
  info: (msg: string, duration?: number) => toast.show('info', msg, duration),
  confirm: (message: string, onConfirm: () => void, confirmText = 'Confirm') => {
    return toast.show('warning', message, 10000, { onConfirm, confirmText });
  },
  dismiss: (id: string) => {
    toasts = toasts.filter((t) => t.id !== id);
    notify();
  },
};

const progressColorMap: Record<ToastType, string> = {
  success: 'bg-green-400',
  error: 'bg-red-400',
  warning: 'bg-amber-400',
  info: 'bg-blue-400',
};

const SingleToast: React.FC<{ item: ToastItem }> = ({ item }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const handleDismiss = () => {
    setVisible(false);
    setTimeout(() => toast.dismiss(item.id), 200);
  };

  const handleConfirm = () => {
    item.onConfirm?.();
    handleDismiss();
  };

  const duration = item.duration || 3000;

  return (
    <div
      className={`relative overflow-hidden rounded-xl border backdrop-blur-xl shadow-lg transition-all duration-200 ${
        bgMap[item.type]
      } ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'}`}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        {iconMap[item.type]}
        <span className="text-sm font-medium text-stone-200 flex-1">{item.message}</span>
        {item.onConfirm && (
          <button
            onClick={handleConfirm}
            className="px-3 py-1 text-xs font-bold text-white bg-orange-500 rounded-lg hover:bg-orange-600 active:scale-95 transition-all"
          >
            {item.confirmText || 'Confirm'}
          </button>
        )}
        <button onClick={handleDismiss} className="p-0.5 text-stone-500 hover:text-stone-300 transition-colors" aria-label="Dismiss">
          <X size={14} />
        </button>
      </div>
      {item.onConfirm && duration > 0 && (
        <div className="h-0.5 w-full bg-stone-800/30">
          <div
            className={`h-full ${progressColorMap[item.type]}`}
            style={{
              animation: `shrink-width ${duration}ms linear forwards`,
            }}
          />
        </div>
      )}
    </div>
  );
};

export const ToastContainer: React.FC = () => {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    toastListeners.push(setItems);
    return () => {
      toastListeners = toastListeners.filter((fn) => fn !== setItems);
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="fixed top-4 left-4 right-4 z-[200] flex flex-col gap-2 pointer-events-none">
      {items.map((item) => (
        <div key={item.id} className="pointer-events-auto">
          <SingleToast item={item} />
        </div>
      ))}
    </div>
  );
};
