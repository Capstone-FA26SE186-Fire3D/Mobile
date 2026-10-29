const tails = new Map<string, Promise<unknown>>();

/**
 * Runs `run` after every earlier operation queued on the same package key has settled (fulfilled or rejected), so two
 * screens or a restore and a download never write the same package folders at the same time. Keys are independent.
 * Only public package-cache functions take the lock; helpers they call must not, or the queue would wait on itself.
 */
export function withPackageLock<T>(key: string, run: () => Promise<T>): Promise<T> {
  const previous = tails.get(key) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(run);
  tails.set(key, current);
  const release = () => {
    if (tails.get(key) === current) tails.delete(key);
  };
  current.then(release, release);
  return current;
}
