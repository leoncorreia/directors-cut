import { AnimatePresence, motion } from "framer-motion";
import type { ToastItem } from "../hooks/useToast";

type ToastProps = {
  toasts: ToastItem[];
  onRemove: (id: string) => void;
};

const toastClassByType: Record<ToastItem["type"], string> = {
  success: "border-green-500/30 bg-green-500/15 text-green-200",
  error: "border-red-500/30 bg-red-500/15 text-red-200",
  info: "border-cine-accent/40 bg-cine-accent/15 text-violet-200",
};

export const Toast = ({ toasts, onRemove }: ToastProps): JSX.Element => (
  <div className="fixed bottom-4 right-4 z-[100] flex w-[320px] flex-col gap-2">
    <AnimatePresence>
      {toasts.map((toast) => (
        <motion.button
          key={toast.id}
          type="button"
          className={`rounded-lg border px-4 py-3 text-left text-sm ${toastClassByType[toast.type]}`}
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 40 }}
          transition={{ duration: 0.25 }}
          onClick={() => onRemove(toast.id)}
        >
          {toast.message}
        </motion.button>
      ))}
    </AnimatePresence>
  </div>
);
