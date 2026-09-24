/**
 * Domain model for PriceWise ישראל.
 *
 * Every piece of price information carries its own provenance (`DataSource`)
 * and timestamp, so the UI can always say where a number came from and how
 * old it is. Nothing in the app is allowed to display a price without these.
 */

export type ChainId = string;
export type ProductId = string;

/** Where a piece of data came from. Shown to the user next to every price. */
export interface DataSource {
  kind:
    | "demo" // bundled sample data — never real prices
    | "transparency-feed" // chain files published under חוק שקיפות מחירים
    | "api" // a backend price API
    | "open-food-facts" // product metadata from Open Food Facts
    | "ai" // AI recognition from a photo
    | "user-report"; // crowd-sourced report
  /** Hebrew label for the UI, e.g. "נתוני הדגמה" or "קובץ שקיפות מחירים — שופרסל". */
  label: string;
  url?: string;
}

export interface Chain {
  id: ChainId;
  name: string;
  nameEn: string;
  /** Brand-ish accent used for the chain avatar. */
  color: string;
  /** Short monogram shown in the avatar. */
  initials: string;
  clubName?: string;
  website?: string;
  /** Chain code in the Israeli price-transparency XML feeds (ChainId field). */
  transparencyChainCode?: string;
  kind: "supermarket" | "pharm" | "local";
}

export type SizeUnit = "g" | "kg" | "ml" | "l" | "unit";

export interface ProductSize {
  amount: number;
  unit: SizeUnit;
}

export type CategoryId =
  | "dairy"
  | "bakery"
  | "breakfast"
  | "drinks"
  | "snacks"
  | "pantry"
  | "produce"
  | "meat"
  | "frozen"
  | "cleaning"
  | "personal-care"
  | "baby"
  | "other";

export interface Product {
  /** Namespaced id: "demo:…", "off:<barcode>", "api:…". */
  id: ProductId;
  barcode?: string;
  name: string;
  brand?: string;
  size?: ProductSize;
  category: CategoryId;
  imageUrl?: string;
  /** Emoji fallback when there is no photo. */
  emoji?: string;
  ingredients?: string;
  source: DataSource;
}

export interface PromoPrice {
  /** Effective price per single unit when the promo conditions are met. */
  unitPrice: number;
  /** Human text as published by the chain, e.g. "2 ב-30 ₪". */
  label: string;
  minQuantity?: number;
  validUntil?: string;
}

export interface ClubPrice {
  unitPrice: number;
  clubName: string;
  label?: string;
}

/** One chain's price for one product. */
export interface PriceQuote {
  productId: ProductId;
  chainId: ChainId;
  branchId?: string;
  /** Shelf price. `null` means the chain lists the item but the price is unknown. */
  regular: number | null;
  promo?: PromoPrice;
  club?: ClubPrice;
  currency: "ILS";
  /** ISO timestamp of when this price was last confirmed by the source. */
  updatedAt: string;
  source: DataSource;
}

export interface PricePoint {
  date: string;
  price: number;
}

export interface OpeningHours {
  /** 0 = Sunday … 6 = Saturday. `null` = closed that day. */
  [weekday: number]: { open: string; close: string } | null;
}

export interface Branch {
  id: string;
  chainId: ChainId;
  name: string;
  address: string;
  city: string;
  lat: number;
  lng: number;
  /** True when only the town could be located, so distance is rough. */
  approximateLocation?: boolean;
  /** Unknown when the source (e.g. transparency Stores files) doesn't publish hours. */
  hours?: OpeningHours;
  phone?: string;
  source: DataSource;
}

export interface GeoPoint {
  lat: number;
  lng: number;
}

/** A single guess from the image recognizer. */
export interface RecognitionCandidate {
  name: string;
  brand?: string;
  sizeText?: string;
  barcode?: string;
  /** 0..1 */
  confidence: number;
  /** Resolved catalog match, if one was found. */
  product?: Product;
}

export interface RecognitionResult {
  candidates: RecognitionCandidate[];
  /** True when the top candidate is good enough to open directly. */
  confident: boolean;
  source: DataSource;
  /** How the product was found: decoded barcode in the photo, or AI vision. */
  method: "barcode-in-photo" | "vision";
}

export interface PricePreferences {
  includePromos: boolean;
  includeClub: boolean;
  /** Quotes older than this are shown but not used to pick "the cheapest". */
  maxAgeHours: number;
}
