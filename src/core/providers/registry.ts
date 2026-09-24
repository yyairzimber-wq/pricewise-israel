import { DemoBranchProvider } from "./branches/DemoBranchProvider";
import { CompositeCatalogProvider } from "./catalog/CompositeCatalogProvider";
import { DemoCatalogProvider } from "./catalog/DemoCatalogProvider";
import { OpenFoodFactsCatalogProvider } from "./catalog/OpenFoodFactsCatalogProvider";
import { HttpBranchProvider, HttpCatalogProvider, HttpPriceProvider } from "./http";
import { DemoPriceProvider } from "./prices/DemoPriceProvider";
import { DemoRecognizer, HttpVisionRecognizer, UnavailableRecognizer } from "./recognition/recognizers";
import { StaticBranchProvider, StaticCatalogProvider, StaticPriceProvider, StaticSnapshot } from "./static";
import type { BranchProvider, CatalogProvider, PriceProvider, RecognitionProvider } from "./types";

export interface DataConfig {
  /**
   * "demo"   = bundled sample data;
   * "api"    = the live PriceWise server;
   * "static" = the daily price snapshot hosted on a CDN (e.g. Vercel).
   */
  mode: "demo" | "api" | "static";
  apiBaseUrl: string;
  /** Base URL of the static snapshot (folder with meta.json). */
  staticBaseUrl: string;
  /** Vision endpoint, e.g. "/pw-api/recognize". Empty = AI not available. */
  aiEndpoint: string;
  /** Look up unknown barcodes on Open Food Facts for real product names/photos. */
  useOpenFoodFacts: boolean;
}

export interface Providers {
  catalog: CompositeCatalogProvider;
  prices: PriceProvider;
  branches: BranchProvider;
  recognizer: RecognitionProvider;
  config: DataConfig;
}

/** The one place that decides which implementation backs each capability. */
export function createProviders(config: DataConfig): Providers {
  const useApi = config.mode === "api" && config.apiBaseUrl.trim() !== "";
  const useStatic = config.mode === "static" && config.staticBaseUrl.trim() !== "";
  const snap = useStatic ? new StaticSnapshot(config.staticBaseUrl.trim()) : null;

  const catalogs: CatalogProvider[] = snap
    ? [new StaticCatalogProvider(snap)]
    : useApi
      ? [new HttpCatalogProvider(config.apiBaseUrl)]
      : [new DemoCatalogProvider()];
  if (config.useOpenFoodFacts) catalogs.push(new OpenFoodFactsCatalogProvider());

  const real = useApi || useStatic;
  return {
    catalog: new CompositeCatalogProvider(catalogs),
    prices: snap ? new StaticPriceProvider(snap) : useApi ? new HttpPriceProvider(config.apiBaseUrl) : new DemoPriceProvider(),
    branches: snap ? new StaticBranchProvider(snap) : useApi ? new HttpBranchProvider(config.apiBaseUrl) : new DemoBranchProvider(),
    // With real data, never fall back to the demo picker (it would suggest fake products).
    recognizer: config.aiEndpoint.trim() ? new HttpVisionRecognizer(config.aiEndpoint.trim()) : real ? new UnavailableRecognizer() : new DemoRecognizer(),
    config,
  };
}

export const DEFAULT_DATA_CONFIG: DataConfig = {
  mode: (import.meta.env.VITE_DATA_MODE as DataConfig["mode"]) || "demo",
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || "",
  staticBaseUrl: import.meta.env.VITE_STATIC_BASE_URL || "./data",
  aiEndpoint: import.meta.env.VITE_AI_ENDPOINT || "",
  useOpenFoodFacts: true,
};
