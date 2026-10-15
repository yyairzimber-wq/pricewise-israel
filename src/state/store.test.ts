import { beforeEach, describe, expect, it } from "vitest";
import type { Product } from "../core/types";
import { MAX_QUANTITY, useApp } from "./store";

const product = (id: string): Product => ({ id, name: id, category: "other", source: { kind: "transparency-feed", label: "x" } });

// Note: there is no localStorage in this test environment — which also proves the store
// still works when storage is unavailable (private mode, blocked, full).
describe("app store", () => {
  beforeEach(() => useApp.setState({ basket: [], favorites: [], history: [], priceWatch: {}, recentSearches: [] }));

  it("adds to the basket and merges repeats", () => {
    const { addToBasket } = useApp.getState();
    addToBasket(product("a"));
    addToBasket(product("a"), 2);
    expect(useApp.getState().basket).toEqual([{ product: product("a"), quantity: 3 }]);
  });

  it("caps a basket line at the maximum", () => {
    const { addToBasket, setQuantity } = useApp.getState();
    addToBasket(product("a"), 60);
    addToBasket(product("a"), 60);
    expect(useApp.getState().basket[0].quantity).toBe(MAX_QUANTITY);
    setQuantity("a", 100_000);
    expect(useApp.getState().basket[0].quantity).toBe(MAX_QUANTITY);
    setQuantity("a", 2.7);
    expect(useApp.getState().basket[0].quantity).toBe(2);
    setQuantity("a", 0);
    expect(useApp.getState().basket).toEqual([]);
  });

  it("favorites keep the price baseline and drop it again", () => {
    const { toggleFavorite } = useApp.getState();
    toggleFavorite(product("a"), { price: 5, chainId: "x", at: "2026-10-01T00:00:00Z" });
    expect(useApp.getState().priceWatch.a?.price).toBe(5);
    toggleFavorite(product("a"));
    expect(useApp.getState().favorites).toEqual([]);
    expect(useApp.getState().priceWatch.a).toBeUndefined();
  });

  it("history collapses an immediate repeat and keeps at most 300 entries", () => {
    const { addHistory } = useApp.getState();
    addHistory(product("a"), "search");
    addHistory(product("a"), "photo");
    expect(useApp.getState().history).toHaveLength(1);
    for (let i = 0; i < 350; i++) addHistory(product(`p${i}`), "search");
    expect(useApp.getState().history).toHaveLength(300);
  });

  it("recent searches are de-duplicated, trimmed and limited", () => {
    const { addRecentSearch } = useApp.getState();
    addRecentSearch("  חלב ");
    addRecentSearch("חלב");
    addRecentSearch("   ");
    expect(useApp.getState().recentSearches).toEqual(["חלב"]);
    for (let i = 0; i < 12; i++) addRecentSearch(`q${i}`);
    expect(useApp.getState().recentSearches).toHaveLength(8);
  });

  it("at least one chain always stays followed", () => {
    useApp.setState({ followedChains: ["a"] });
    useApp.getState().toggleChain("a");
    expect(useApp.getState().followedChains).toEqual(["a"]);
  });

  it("resetDataConfig restores the build's default data source", () => {
    useApp.getState().setData({ mode: "demo", staticBaseUrl: "./stale" });
    useApp.getState().resetDataConfig();
    expect(useApp.getState().data.staticBaseUrl).not.toBe("./stale");
  });
});
