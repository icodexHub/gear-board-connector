import { create } from "zustand";

type AuthState = {
  loggedIn: boolean;
  connect: () => void;
  disconnect: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  loggedIn: false,
  connect: () => set({ loggedIn: true }),
  disconnect: () => set({ loggedIn: false }),
}));
