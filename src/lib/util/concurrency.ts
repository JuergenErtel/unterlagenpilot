/**
 * Wendet `fn` auf alle `items` an, aber mit begrenzter Nebenläufigkeit statt
 * streng nacheinander. Reihenfolge der Ergebnisse entspricht der Eingabe.
 * Wird z.B. für die KI-Prüfung genutzt: mehrere Dokumente gleichzeitig statt
 * sequentiell, ohne den Anbieter mit unbegrenzt vielen Requests zu überfahren.
 */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const size = Math.max(1, Math.min(limit, items.length));

  async function worker(): Promise<void> {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]!, i);
    }
  }

  await Promise.all(Array.from({ length: size }, () => worker()));
  return results;
}
