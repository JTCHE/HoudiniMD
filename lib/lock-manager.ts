// Simple in-memory lock to prevent concurrent generation of the same page
const locks = new Map<string, Promise<void>>();

export async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  // Wait if already locked
  while (locks.has(key)) {
    await locks.get(key);
  }

  // Acquire lock
  let releaseLock: () => void;
  const lockPromise = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  locks.set(key, lockPromise);

  try {
    return await fn();
  } finally {
    locks.delete(key);
    releaseLock!();
  }
}
