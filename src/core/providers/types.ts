import type {
  Branch,
  ChainId,
  GeoPoint,
  PricePoint,
  PriceQuote,
  Product,
  RecognitionResult,
} from "../types";

/**
 * Provider contracts. The UI and services only ever talk to these interfaces;
 * swapping demo data for a real price source means writing a new
 * implementation and registering it in `registry.ts` — nothing else changes.
 */

export interface CatalogProvider {
  readonly id: string;
  /** Can this provider resolve ids with the given namespace ("demo", "off", "api")? */
  handles(productId: string): boolean;
  getById(productId: string): Promise<Product | null>;
  getByBarcode(barcode: string): Promise<Product | null>;
  search(query: string, limit?: number): Promise<Product[]>;
}

export interface PriceQuery {
  chainIds?: ChainId[];
  branchId?: string;
  /** One quote per listed branch that has its own price (branches without data are omitted). */
  branchIds?: string[];
}

export interface PriceProvider {
  readonly id: string;
  /** Demo providers make the whole UI show the "נתוני הדגמה" disclaimer. */
  readonly isDemo: boolean;
  getQuotes(product: Product, query?: PriceQuery): Promise<PriceQuote[]>;
  /** Optional — not every source keeps history. */
  getHistory?(product: Product, chainId: ChainId, days: number): Promise<PricePoint[]>;
}

export interface BranchQuery {
  near?: GeoPoint;
  radiusKm?: number;
  chainIds?: ChainId[];
  limit?: number;
}

export interface BranchProvider {
  readonly id: string;
  readonly isDemo: boolean;
  getBranches(query: BranchQuery): Promise<Branch[]>;
}

export interface RecognitionProvider {
  readonly id: string;
  readonly isDemo: boolean;
  /** Identify a product from a photo of its packaging. */
  recognize(image: Blob): Promise<RecognitionResult>;
}
