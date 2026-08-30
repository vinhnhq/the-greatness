/**
 * The database schema as TypeScript. Hand-maintained alongside
 * `src/db/migrations/**` — every migration that changes a table changes this
 * file in the same commit, or the two drift silently.
 *
 * **Column types are written for both drivers.** SQLite has no `timestamptz`
 * and no `boolean`: a timestamp round-trips as an ISO string and a flag as
 * 0/1, while Postgres returns a `Date` and a `boolean`. Rather than teach
 * every call site which driver is live, timestamps are typed `Date | string`
 * here and normalised once by each entity's zod parser (`z.coerce.date()`),
 * which accepts either.
 */

/** A timestamp as it arrives from either driver. */
export type Timestamp = Date | string;

export interface UsersTable {
  id: string;
  email: string;
  emailVerified: number | boolean;
  name: string | null;
  image: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface SessionsTable {
  id: string;
  userId: string;
  token: string;
  expiresAt: Timestamp;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface AccountsTable {
  id: string;
  userId: string;
  accountId: string;
  providerId: string;
  accessToken: string | null;
  refreshToken: string | null;
  accessTokenExpiresAt: Timestamp | null;
  refreshTokenExpiresAt: Timestamp | null;
  scope: string | null;
  idToken: string | null;
  password: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface VerificationsTable {
  id: string;
  identifier: string;
  value: string;
  expiresAt: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CategoriesTable {
  id: string;
  name: string;
  slug: string;
  /** The Sapo collection this was imported from, or null when it was created
   * here. Provenance only — see migration 005. */
  sapoId: string | null;
  /** One flat level in v1; the column exists so a tree needs no migration. */
  parentId: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ProductsTable {
  id: string;
  name: string;
  slug: string;
  /** The Sapo product this was imported from, or null when it was created
   * here. Provenance only — see migration 005. */
  sapoId: string | null;
  sku: string | null;
  description: string | null;
  /** Minor units (cents/đồng). Never a float — see `lib/money.ts`. */
  priceMinor: number;
  currency: string;
  status: string;
  /** Folded name + sku + description. Written only by the product repository
   * — see `lib/search-text.ts` for why the fold is not done in SQL. */
  searchText: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ProductCategoriesTable {
  productId: string;
  categoryId: string;
}

/**
 * The media library (migration 004). **No owner** — an asset exists whether
 * or not any product uses it, which is what makes uploading a batch before
 * deciding what it is for possible.
 */
export interface MediaAssetsTable {
  id: string;
  kind: string;
  /** The bytes exactly as the operator chose them. */
  originUrl: string;
  /** The web-delivery variant. Null when optimization failed and the origin
   * was kept rather than losing the file — see `lib/media/prepare.ts`. */
  optimizedUrl: string | null;
  /** Video only: the frame grabbed for the thumbnail. */
  posterUrl: string | null;
  mime: string;
  bytes: number;
  optimizedBytes: number | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  /** On the asset, not the link: it describes the picture, not the
   * relationship to a product. */
  alt: string | null;
  createdAt: Timestamp;
}

/**
 * Which assets a product shows, and in what order.
 *
 * `position` lives on the **link**, not the asset: two products may use the
 * same photograph and order their galleries differently.
 */
export interface ProductMediaTable {
  productId: string;
  mediaId: string;
  position: number;
}

export interface DB {
  users: UsersTable;
  sessions: SessionsTable;
  accounts: AccountsTable;
  verifications: VerificationsTable;
  categories: CategoriesTable;
  products: ProductsTable;
  product_categories: ProductCategoriesTable;
  media_assets: MediaAssetsTable;
  product_media: ProductMediaTable;
}
