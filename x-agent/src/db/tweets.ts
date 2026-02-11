/**
 * SQLite Database for tracking fetched tweets
 * Prevents duplicate fetching and stores history
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

const DB_PATH = './data/tweets.db';

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize database
const db = new Database(DB_PATH);

// Create tables if they don't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS fetched_tweets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tweet_id TEXT UNIQUE,
    handle TEXT NOT NULL,
    content TEXT NOT NULL,
    timestamp TEXT,
    likes TEXT,
    retweets TEXT,
    replies TEXT,
    has_media INTEGER DEFAULT 0,
    media_type TEXT,
    media_urls TEXT,
    video_url TEXT,
    video_thumbnail TEXT,
    fetched_at TEXT NOT NULL,
    rewritten INTEGER DEFAULT 0,
    rewritten_content TEXT
  );

  CREATE TABLE IF NOT EXISTS sync_state (
    id INTEGER PRIMARY KEY DEFAULT 1,
    last_sync_timestamp TEXT,
    last_sync_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_handle ON fetched_tweets(handle);
  CREATE INDEX IF NOT EXISTS idx_fetched_at ON fetched_tweets(fetched_at);
  CREATE INDEX IF NOT EXISTS idx_tweet_id ON fetched_tweets(tweet_id);
  CREATE INDEX IF NOT EXISTS idx_timestamp ON fetched_tweets(timestamp);
`);

// Initialize sync state if not exists
db.exec(`INSERT OR IGNORE INTO sync_state (id, last_sync_timestamp, last_sync_at) VALUES (1, NULL, NULL)`);

export interface StoredTweet {
  id?: number;
  tweet_id: string;
  handle: string;
  content: string;
  timestamp?: string;
  likes?: string;
  retweets?: string;
  replies?: string;
  has_media?: boolean;
  media_type?: string;
  media_urls?: string[];
  video_url?: string;
  video_thumbnail?: string;
  fetched_at: string;
  rewritten?: boolean;
  rewritten_content?: string;
}

/**
 * Generate a unique tweet ID from content hash
 */
export function generateTweetId(handle: string, content: string, timestamp: string): string {
  const data = `${handle}:${content.substring(0, 100)}:${timestamp}`;
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `${handle}_${Math.abs(hash).toString(36)}`;
}

/**
 * Check if a tweet has already been fetched (by content similarity)
 */
export function isContentFetched(handle: string, content: string): boolean {
  const contentPrefix = content.substring(0, 100);
  const stmt = db.prepare(`
    SELECT 1 FROM fetched_tweets 
    WHERE handle = ? AND content LIKE ?
    LIMIT 1
  `);
  const result = stmt.get(handle, `${contentPrefix}%`);
  return !!result;
}

/**
 * Save a fetched tweet to database
 */
export function saveTweet(tweet: StoredTweet): boolean {
  try {
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO fetched_tweets 
      (tweet_id, handle, content, timestamp, likes, retweets, replies, 
       has_media, media_type, media_urls, video_url, video_thumbnail, fetched_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      tweet.tweet_id,
      tweet.handle,
      tweet.content,
      tweet.timestamp || '',
      tweet.likes || '0',
      tweet.retweets || '0',
      tweet.replies || '0',
      tweet.has_media ? 1 : 0,
      tweet.media_type || null,
      tweet.media_urls ? JSON.stringify(tweet.media_urls) : null,
      tweet.video_url || null,
      tweet.video_thumbnail || null,
      tweet.fetched_at
    );
    
    return result.changes > 0;
  } catch (error) {
    console.error('Failed to save tweet:', error);
    return false;
  }
}

/**
 * Get the last sync timestamp
 * Returns the timestamp of the newest tweet we've seen
 */
export function getLastSyncTimestamp(): string | null {
  const stmt = db.prepare('SELECT last_sync_timestamp FROM sync_state WHERE id = 1');
  const result = stmt.get() as any;
  return result?.last_sync_timestamp || null;
}

/**
 * Update the last sync timestamp
 */
export function updateLastSyncTimestamp(timestamp: string): void {
  const stmt = db.prepare(`
    UPDATE sync_state 
    SET last_sync_timestamp = ?, last_sync_at = ?
    WHERE id = 1
  `);
  stmt.run(timestamp, new Date().toISOString());
}

/**
 * Get the newest tweet timestamp we have
 */
export function getNewestTweetTimestamp(): string | null {
  const stmt = db.prepare(`
    SELECT timestamp FROM fetched_tweets 
    WHERE timestamp IS NOT NULL AND timestamp != ''
    ORDER BY timestamp DESC 
    LIMIT 1
  `);
  const result = stmt.get() as any;
  return result?.timestamp || null;
}

/**
 * Get stats
 */
export function getStats(): { total: number; today: number; byHandle: Record<string, number> } {
  const totalStmt = db.prepare('SELECT COUNT(*) as count FROM fetched_tweets');
  const total = (totalStmt.get() as any).count;

  const todayCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const todayStmt = db.prepare('SELECT COUNT(*) as count FROM fetched_tweets WHERE fetched_at >= ?');
  const today = (todayStmt.get(todayCutoff) as any).count;

  const byHandleStmt = db.prepare('SELECT handle, COUNT(*) as count FROM fetched_tweets GROUP BY handle');
  const byHandleRows = byHandleStmt.all() as any[];
  const byHandle: Record<string, number> = {};
  for (const row of byHandleRows) {
    byHandle[row.handle] = row.count;
  }

  return { total, today, byHandle };
}

/**
 * Close database connection
 */
export function closeDb(): void {
  db.close();
}
