export interface ToastItem {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
  duration?: number;
}

type ToastListener = (toasts: ToastItem[]) => void;

let toasts: ToastItem[] = [];
const listeners: Set<ToastListener> = new Set();

export const notifyToastsChange = () => {
  listeners.forEach((listener) => listener([...toasts]));
};

export const showToast = (toast: Omit<ToastItem, 'id'>) => {
  const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const newToast: ToastItem = { ...toast, id };
  
  // Avoid duplicating identical messages within 2 seconds
  const isDuplicate = toasts.some(
    (t) => t.type === toast.type && t.title === toast.title && t.message === toast.message
  );
  if (isDuplicate) return id;

  toasts = [newToast, ...toasts].slice(0, 5);
  notifyToastsChange();

  const duration = toast.duration ?? (toast.type === 'error' ? 6000 : 3500);
  setTimeout(() => {
    removeToast(id);
  }, duration);

  return id;
};

export const removeToast = (id: string) => {
  toasts = toasts.filter((t) => t.id !== id);
  notifyToastsChange();
};

export const clearAllToasts = () => {
  toasts = [];
  notifyToastsChange();
};

export const subscribeToasts = (listener: ToastListener) => {
  listeners.add(listener);
  listener([...toasts]);
  return () => {
    listeners.delete(listener);
  };
};
