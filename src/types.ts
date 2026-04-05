export interface LinkedinBookmarkRecord {
  id: string;
  postUrl: string;
  canonicalUrl: string;
  text: string;
  authorName?: string;
  authorSlug?: string;
  authorUrl?: string;
  postedAt?: string | null;
  bookmarkedAt?: string | null;
  savedAtLabel?: string | null;
  kind: "post" | "article" | "unknown";
  links: string[];
  syncedAt: string;
  provider: "linkedin";
}

export interface LinkedinBookmarkMeta {
  provider: "linkedin";
  schemaVersion: number;
  totalBookmarks: number;
  lastSyncAt?: string;
}

export interface SyncProgress {
  rounds: number;
  scraped: number;
  newAdded: number;
  done: boolean;
}

export interface LinkedinSyncState {
  provider: "linkedin";
  lastRunAt?: string;
  totalRuns: number;
  totalAdded: number;
  lastAdded: number;
  lastSeenIds: string[];
}

export interface ExtractedBookmarkCandidate {
  url: string;
  text: string;
  authorName?: string;
  authorSlug?: string;
  authorUrl?: string;
  postedAt?: string | null;
  savedAtLabel?: string | null;
  links: string[];
  kind: "post" | "article" | "unknown";
}
