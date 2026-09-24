import { useEffect, useMemo, useRef, useState } from "react";
import { createProviders, type Providers } from "../core/providers/registry";
import { compareProduct, priceChange, type ComparisonRow, type PriceChange } from "../core/services/pricing";
import type { PriceQuote, Product } from "../core/types";
import { useApp } from "./store";

let cached: { key: string; providers: Providers } | null = null;

/** Providers are rebuilt only when the data configuration changes. */
export function useProviders(): Providers {
  const data = useApp((s) => s.data);
  const key = JSON.stringify(data);
  return useMemo(() => {
    if (cached?.key !== key) cached = { key, providers: createProviders(data) };
    return cached.providers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

export interface AsyncState<T> {
  data?: T;
  loading: boolean;
  error: Error | null;
  reload(): void;
}

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [state, setState] = useState<{ data?: T; loading: boolean; error: Error | null }>({ loading: true, error: null });
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    let alive = true;
    setState((s) => ({ data: s.data, loading: true, error: null }));
    fnRef
      .current()
      .then((data) => alive && setState({ data, loading: false, error: null }))
      .catch((error: Error) => alive && setState({ data: undefined, loading: false, error }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  return { ...state, reload: () => setTick((t) => t + 1) };
}

export function useProduct(productId: string | undefined) {
  const { catalog } = useProviders();
  return useAsync(async () => (productId ? catalog.getById(decodeURIComponent(productId)) : null), [catalog, productId]);
}

export function useQuotes(product: Product | null | undefined) {
  const { prices } = useProviders();
  return useAsync<PriceQuote[]>(async () => (product ? prices.getQuotes(product) : []), [prices, product?.id]);
}

export function useIsDemo() {
  return useProviders().prices.isDemo;
}

export function haptic(ms = 12) {
  if (useApp.getState().haptics && "vibrate" in navigator) navigator.vibrate?.(ms);
}

export interface FavoritePrice {
  cheapest?: ComparisonRow;
  change: PriceChange | null;
}

/**
 * Current cheapest price for each favorite vs. the price when it was saved.
 * Favorites saved before we had a price get their baseline on first sight.
 */
export function useFavoritePrices() {
  const { prices } = useProviders();
  const favorites = useApp((s) => s.favorites);
  const watch = useApp((s) => s.priceWatch);
  const setWatch = useApp((s) => s.setWatch);
  const prefs = useApp((s) => s.prefs);
  const followed = useApp((s) => s.followedChains);
  const ids = favorites.slice(0, 40).map((f) => f.id).join(",");

  const quotesQ = useAsync(async () => {
    const list = favorites.slice(0, 40);
    const entries = await Promise.all(list.map(async (p) => [p.id, await prices.getQuotes(p).catch(() => [])] as const));
    return new Map<string, PriceQuote[]>(entries);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prices, ids]);

  const result = useMemo(() => {
    const out = new Map<string, FavoritePrice>();
    for (const [id, quotes] of quotesQ.data ?? []) {
      const { cheapest } = compareProduct(quotes, { prefs, chainIds: followed });
      out.set(id, { cheapest, change: priceChange(watch[id], cheapest) });
    }
    return out;
  }, [quotesQ.data, prefs, followed, watch]);

  useEffect(() => {
    for (const [id, r] of result) {
      if (!watch[id] && r.cheapest?.best) setWatch(id, { price: r.cheapest.best.price, chainId: r.cheapest.chain.id, at: new Date().toISOString() });
    }
  }, [result, watch, setWatch]);

  const drops = [...result.entries()].filter(([, r]) => r.change && r.change.drop >= 0.1);
  return { byId: result, drops, loading: quotesQ.loading };
}
