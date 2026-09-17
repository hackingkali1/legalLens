import crypto from 'crypto';

export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  maxSize: number;
}

/**
 * In-memory, session-scoped LRU cache for LLM analysis responses.
 * Strictly in-memory (zero disk persistence) to respect privacy and in-session constraints.
 */
export class AnalysisSessionCache {
  private cache = new Map<string, { value: unknown; timestamp: number }>();
  private maxSize: number;
  private hits = 0;
  private misses = 0;

  constructor(maxSize = 250) {
    this.maxSize = maxSize;
  }

  /**
   * Generates a deterministic SHA-256 hash for cache keys.
   */
  public computeHash(content: string): string {
    return crypto.createHash('sha256').update(content.trim()).digest('hex');
  }

  /**
   * Retrieves a cached value. Moves key to the end of the Map to preserve LRU ordering.
   */
  public get<T>(key: string): T | undefined {
    if (!this.cache.has(key)) {
      this.misses++;
      return undefined;
    }

    const entry = this.cache.get(key)!;
    // Re-insert to refresh LRU position
    this.cache.delete(key);
    this.cache.set(key, entry);

    this.hits++;
    return entry.value as T;
  }

  /**
   * Stores a value in the in-memory cache with LRU eviction if maxSize is reached.
   */
  public set<T>(key: string, value: T): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Evict oldest item (first key in Map)
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, { value, timestamp: Date.now() });
  }

  /**
   * Checks if a key exists in cache without updating hit/miss statistics.
   */
  public has(key: string): boolean {
    return this.cache.has(key);
  }

  /**
   * Clears the entire in-memory cache and resets statistics.
   */
  public clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Returns current cache performance metrics.
   */
  public getStats(): CacheStats {
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.cache.size,
      maxSize: this.maxSize,
    };
  }
}

// Global singleton instance for server session
export const sessionAnalysisCache = new AnalysisSessionCache();
