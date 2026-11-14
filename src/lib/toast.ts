import { create } from "zustand";

export interface Toast {
  id: number;
  message: string;
  action?: { label: string; run: () => void };
}

interface ToastState {
  toasts: Toast[];
  push(t: Omit<Toast, "id">): void;
  dismiss(id: number): void;
}

let seq = 0;

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  // Newest last; only the three most recent stay on screen.
  push: (t) => set((s) => ({ toasts: [...s.toasts.slice(-2), { ...t, id: ++seq }] })),
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Brief, non-blocking confirmation, optionally with one action (e.g. Undo). */
export const toast = (message: string, action?: Toast["action"]) => useToasts.getState().push({ message, action });
