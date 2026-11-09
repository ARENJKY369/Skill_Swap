import { create } from 'zustand';

export type ToastKind = 'success' | 'error' | 'info' | 'warning';
export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  detail?: string;
}

interface ToastState {
  toasts: Toast[];
  push: (kind: ToastKind, title: string, detail?: string) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: (kind, title, detail) => {
    const id = nextId++;
    set({ toasts: [...get().toasts.slice(-3), { id, kind, title, detail }] });
    window.setTimeout(() => get().dismiss(id), 4000);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export const toast = {
  success: (t: string, d?: string) => useToastStore.getState().push('success', t, d),
  error: (t: string, d?: string) => useToastStore.getState().push('error', t, d),
  info: (t: string, d?: string) => useToastStore.getState().push('info', t, d),
  warning: (t: string, d?: string) => useToastStore.getState().push('warning', t, d),
};
