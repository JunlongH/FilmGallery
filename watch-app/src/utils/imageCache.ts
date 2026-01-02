import { Image } from 'react-native';

interface CacheEntry {
  uri: string;
  timestamp: number;
}

class ImageCache {
  private cache: Map<string, CacheEntry> = new Map();
  private readonly maxSize: number = 20; // 限制最多缓存20张图片
  private readonly maxAge: number = 30 * 60 * 1000; // 30分钟过期

  /**
   * 预加载图片到内存缓存
   */
  async preload(uri: string): Promise<void> {
    try {
      await Image.prefetch(uri);
      this.cache.set(uri, {
        uri,
        timestamp: Date.now(),
      });
      this.evictOldEntries();
    } catch (error) {
      console.warn('Failed to preload image:', uri, error);
    }
  }

  /**
   * 批量预加载多张图片
   */
  async preloadBatch(uris: string[]): Promise<void> {
    const promises = uris.map(uri => this.preload(uri));
    await Promise.allSettled(promises);
  }

  /**
   * 检查图片是否在缓存中且未过期
   */
  has(uri: string): boolean {
    const entry = this.cache.get(uri);
    if (!entry) return false;

    const age = Date.now() - entry.timestamp;
    if (age > this.maxAge) {
      this.cache.delete(uri);
      return false;
    }

    return true;
  }

  /**
   * 清理过期和超出数量限制的缓存条目
   */
  private evictOldEntries(): void {
    const now = Date.now();

    // 清理过期条目
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.maxAge) {
        this.cache.delete(key);
      }
    }

    // 如果超出大小限制，删除最旧的条目
    if (this.cache.size > this.maxSize) {
      const entries = Array.from(this.cache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);

      const toDelete = entries.slice(0, entries.length - this.maxSize);
      toDelete.forEach(([key]) => this.cache.delete(key));
    }
  }

  /**
   * 清空所有缓存
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * 获取当前缓存大小
   */
  size(): number {
    return this.cache.size;
  }
}

export const imageCache = new ImageCache();
