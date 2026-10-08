/** Bounded I/O concurrency, preserving input order. */
export async function mapConcurrent(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0,
    failure;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (!failure && next < items.length) {
        const i = next++;
        try {
          results[i] = await fn(items[i], i);
        } catch (error) {
          failure ??= error;
        }
      }
    }),
  );
  if (failure) throw failure;
  return results;
}
