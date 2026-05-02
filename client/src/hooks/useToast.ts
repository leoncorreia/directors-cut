import { useCallback, useMemo, useState } from "react";
import { nanoid } from "nanoid";

export type ToastType = "success" | "error" | "info";

export type ToastItem = {
  id: string;
  message: string;
  type: ToastType;
};

type ToastApi = {
  toasts: ToastItem[];
  showToast: (type: ToastType, message: string) => void;
  removeToast: (id: string) => void;
};

export const useToast = (): ToastApi => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((type: ToastType, message: string) => {
    const id = nanoid();
    setToasts((prev) => {
      const next = [...prev, { id, type, message }];
      return next.slice(-3);
    });
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 4000);
  }, []);

  return useMemo(
    () => ({
      toasts,
      showToast,
      removeToast,
    }),
    [removeToast, showToast, toasts],
  );
};
