/**
 * Simple timestamped logger
 */

export function log(msg: string): void {
  const now = new Date().toLocaleTimeString('en-US', { hour12: false });
  console.log(`[${now}] ${msg}`);
}

export function logError(msg: string, error?: any): void {
  const now = new Date().toLocaleTimeString('en-US', { hour12: false });
  const errorMsg = error?.message ? `: ${error.message.substring(0, 100)}` : '';
  console.error(`[${now}] ❌ ${msg}${errorMsg}`);
}
