import { create } from 'zustand';

export interface PublicUser {
  id: string; name: string; username: string; email: string; role: 'student' | 'admin';
  major: string; university: string; year: string; bio: string; avatar: string | null;
  teaches: string[]; wants: string[];
  teachLevels: Record<string, string>; wantLevels: Record<string, string>;
  avgRating: number; reviewCount: number; status: string; emailVerified: boolean;
  totpEnabled: boolean; restricted: boolean; mustChangePassword?: boolean; demo: boolean; createdAt: string;
}

export type SyncState = 'synced' | 'pending' | 'offline' | 'error';

interface AppState {
  user: PublicUser | null;
  authLoaded: boolean;
  online: boolean;
  dbConnected: boolean | null;
  unreadCount: number;
  syncState: SyncState;
  pendingOutbox: number;
  setUser: (u: PublicUser | null) => void;
  setAuthLoaded: (v: boolean) => void;
  setOnline: (v: boolean) => void;
  setDbConnected: (v: boolean | null) => void;
  setUnreadCount: (n: number) => void;
  setSyncState: (s: SyncState) => void;
  setPendingOutbox: (n: number) => void;
}

export const useAppStore = create<AppState>((set) => ({
  user: null,
  authLoaded: false,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  dbConnected: null,
  unreadCount: 0,
  syncState: 'synced',
  pendingOutbox: 0,
  setUser: (user) => set({ user }),
  setAuthLoaded: (authLoaded) => set({ authLoaded }),
  setOnline: (online) => set({ online }),
  setDbConnected: (dbConnected) => set({ dbConnected }),
  setUnreadCount: (unreadCount) => set({ unreadCount }),
  setSyncState: (syncState) => set({ syncState }),
  setPendingOutbox: (pendingOutbox) => set({ pendingOutbox }),
}));
