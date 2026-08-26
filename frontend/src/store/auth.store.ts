import { create } from "zustand";
import { persist } from "zustand/middleware";

export type UserRole = "owner" | "admin" | "agent";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  tenant_id: string;
  tenant_slug: string;
  tenant_name: string;
}

interface AuthState {
  user: AuthUser | null;
  access_token: string | null;
  refresh_token: string | null;
  isAuthenticated: boolean;
  hasHydrated: boolean;

  login: (user: AuthUser, access_token: string, refresh_token: string) => void;
  logout: () => void;
  updateUser: (updates: Partial<AuthUser>) => void;
  setHasHydrated: (value: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      access_token: null,
      refresh_token: null,
      isAuthenticated: false,
      hasHydrated: false,

      login: (user, access_token, refresh_token) => {
        localStorage.setItem("access_token", access_token);
        localStorage.setItem("refresh_token", refresh_token);
        set({ user, access_token, refresh_token, isAuthenticated: true });
      },

      logout: () => {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        set({ user: null, access_token: null, refresh_token: null, isAuthenticated: false });
      },

      updateUser: (updates) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...updates } : null,
        })),

      setHasHydrated: (value) => set({ hasHydrated: value }),
    }),
    {
      name: "wapisend-auth",
      partialize: (state) => ({
        user: state.user,
        access_token: state.access_token,
        refresh_token: state.refresh_token,
        isAuthenticated: state.isAuthenticated,
      }),
      // AppLayout must not redirect to /login on the pre-hydration default
      // state (isAuthenticated: false) before the persisted session has
      // actually loaded from localStorage — this flag gates that check.
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);

// Role guards
export const isOwner = (role: UserRole) => role === "owner";
export const isAdminOrOwner = (role: UserRole) => ["owner", "admin"].includes(role);
