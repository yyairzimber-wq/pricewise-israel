import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { CHAINS } from "../core/data/chains";
import { DEFAULT_DATA_CONFIG, type DataConfig } from "../core/providers/registry";
import type { PriceWatchBaseline } from "../core/services/pricing";
import type { ChainId, PricePreferences, Product } from "../core/types";

export type ThemeMode = "system" | "light" | "dark";
export type ScanMethod = "photo" | "barcode" | "search";

export interface HistoryEntry {
  id: string;
  product: Product;
  method: ScanMethod;
  at: string;
}

export interface BasketItem {
  product: Product;
  quantity: number;
}

interface AppState {
  // settings
  theme: ThemeMode;
  prefs: PricePreferences;
  followedChains: ChainId[];
  homeChainId: ChainId | null;
  radiusKm: number;
  /** ₪ per km, used to weigh a far-away cheaper basket against a near one. */
  travelCostPerKm: number;
  haptics: boolean;
  data: DataConfig;
  onboarded: boolean;

  // user data
  basket: BasketItem[];
  favorites: Product[];
  /** Cheapest price when each favorite was saved, to detect price drops. */
  priceWatch: Record<string, PriceWatchBaseline>;
  history: HistoryEntry[];
  recentSearches: string[];

  setTheme(theme: ThemeMode): void;
  setPrefs(patch: Partial<PricePreferences>): void;
  toggleChain(id: ChainId): void;
  setHomeChain(id: ChainId | null): void;
  setRadius(km: number): void;
  setTravelCost(perKm: number): void;
  setHaptics(on: boolean): void;
  setData(patch: Partial<DataConfig>): void;
  setOnboarded(): void;

  addToBasket(product: Product, qty?: number): void;
  setQuantity(productId: string, qty: number): void;
  removeFromBasket(productId: string): void;
  clearBasket(): void;

  toggleFavorite(product: Product, baseline?: PriceWatchBaseline): void;
  setWatch(productId: string, baseline: PriceWatchBaseline): void;
  isFavorite(productId: string): boolean;

  addHistory(product: Product, method: ScanMethod): void;
  removeHistory(id: string): void;
  clearHistory(): void;

  addRecentSearch(q: string): void;
  clearRecentSearches(): void;
  resetAll(): void;
}

const DEFAULTS = {
  theme: "system" as ThemeMode,
  prefs: { includePromos: true, includeClub: false, maxAgeHours: 72 },
  followedChains: CHAINS.map((c) => c.id),
  homeChainId: null,
  radiusKm: 10,
  travelCostPerKm: 1,
  haptics: true,
  data: DEFAULT_DATA_CONFIG,
  onboarded: false,
  basket: [],
  favorites: [],
  priceWatch: {} as Record<string, PriceWatchBaseline>,
  history: [],
  recentSearches: [],
};

export const useApp = create<AppState>()(
  persist(
    (set, get) => ({
      ...DEFAULTS,

      setTheme: (theme) => set({ theme }),
      setPrefs: (patch) => set((s) => ({ prefs: { ...s.prefs, ...patch } })),
      toggleChain: (id) =>
        set((s) => {
          const on = s.followedChains.includes(id);
          if (on && s.followedChains.length === 1) return s; // keep at least one
          return { followedChains: on ? s.followedChains.filter((c) => c !== id) : [...s.followedChains, id] };
        }),
      setHomeChain: (homeChainId) => set({ homeChainId }),
      setRadius: (radiusKm) => set({ radiusKm }),
      setTravelCost: (travelCostPerKm) => set({ travelCostPerKm }),
      setHaptics: (haptics) => set({ haptics }),
      setData: (patch) => set((s) => ({ data: { ...s.data, ...patch } })),
      setOnboarded: () => set({ onboarded: true }),

      addToBasket: (product, qty = 1) =>
        set((s) => {
          const existing = s.basket.find((i) => i.product.id === product.id);
          if (existing) {
            return { basket: s.basket.map((i) => (i.product.id === product.id ? { ...i, quantity: i.quantity + qty } : i)) };
          }
          return { basket: [...s.basket, { product, quantity: qty }] };
        }),
      setQuantity: (productId, qty) =>
        set((s) => ({
          basket: qty <= 0 ? s.basket.filter((i) => i.product.id !== productId) : s.basket.map((i) => (i.product.id === productId ? { ...i, quantity: qty } : i)),
        })),
      removeFromBasket: (productId) => set((s) => ({ basket: s.basket.filter((i) => i.product.id !== productId) })),
      clearBasket: () => set({ basket: [] }),

      toggleFavorite: (product, baseline) =>
        set((s) => {
          const on = s.favorites.some((p) => p.id === product.id);
          const priceWatch = { ...s.priceWatch };
          if (on) delete priceWatch[product.id];
          else if (baseline) priceWatch[product.id] = baseline;
          return { favorites: on ? s.favorites.filter((p) => p.id !== product.id) : [product, ...s.favorites], priceWatch };
        }),
      setWatch: (productId, baseline) => set((s) => ({ priceWatch: { ...s.priceWatch, [productId]: baseline } })),
      isFavorite: (productId) => get().favorites.some((p) => p.id === productId),

      addHistory: (product, method) =>
        set((s) => {
          const entry: HistoryEntry = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, product, method, at: new Date().toISOString() };
          // Collapse immediate repeats of the same product.
          const rest = s.history[0]?.product.id === product.id ? s.history.slice(1) : s.history;
          return { history: [entry, ...rest].slice(0, 300) };
        }),
      removeHistory: (id) => set((s) => ({ history: s.history.filter((h) => h.id !== id) })),
      clearHistory: () => set({ history: [] }),

      addRecentSearch: (q) =>
        set((s) => {
          const t = q.trim();
          if (!t) return s;
          return { recentSearches: [t, ...s.recentSearches.filter((x) => x !== t)].slice(0, 8) };
        }),
      clearRecentSearches: () => set({ recentSearches: [] }),
      resetAll: () => set({ ...DEFAULTS }),
    }),
    {
      name: "pricewise-il",
      version: 2,
      // v2 added chains: follow new ones by default, drop ids that no longer exist.
      migrate: (persisted, version) => {
        const state = persisted as Partial<AppState>;
        if (version < 2 && state.followedChains) {
          const V1 = ["shufersal", "rami-levy", "yochananof", "victory", "carrefour", "tiv-taam", "mahsanei-hashuk", "osher-ad", "super-pharm", "hazi-hinam", "freshmarket", "yeinot-bitan", "machsanei-lahav", "super-yuda"];
          const known = new Set(CHAINS.map((c) => c.id));
          const added = CHAINS.map((c) => c.id).filter((id) => !V1.includes(id));
          state.followedChains = [...state.followedChains.filter((id) => known.has(id)), ...added];
          if (state.homeChainId && !known.has(state.homeChainId)) state.homeChainId = null;
        }
        return state as AppState;
      },
      // Stored settings from older versions lack newer fields: fill them from defaults.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AppState>;
        return { ...current, ...p, data: { ...current.data, ...(p.data ?? {}) }, prefs: { ...current.prefs, ...(p.prefs ?? {}) } };
      },
      // localStorage today; swap for Capacitor Preferences in the native build.
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        theme: s.theme,
        prefs: s.prefs,
        followedChains: s.followedChains,
        homeChainId: s.homeChainId,
        radiusKm: s.radiusKm,
        travelCostPerKm: s.travelCostPerKm,
        haptics: s.haptics,
        data: s.data,
        onboarded: s.onboarded,
        basket: s.basket,
        favorites: s.favorites,
        priceWatch: s.priceWatch,
        history: s.history,
        recentSearches: s.recentSearches,
      }),
    },
  ),
);
