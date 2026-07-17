export class PlatformMetrics {
  private readonly counters = new Map<string, number>();
  private readonly histograms = new Map<string, { labels: string; buckets: readonly number[]; counts: number[]; sum: number; count: number }>();

  increment(name: string, labels: Readonly<Record<string, string>> = {}, value = 1): void {
    if (!Number.isFinite(value) || value < 0) throw new TypeError("metric counter increment must be finite and non-negative");
    const labelText = this.labelText(labels);
    const key = labelText.length === 0 ? name : `${name}{${labelText}}`;
    this.counters.set(key, (this.counters.get(key) ?? 0) + value);
  }

  observe(name: string, value: number, labels: Readonly<Record<string, string>> = {}): void {
    if (!Number.isFinite(value) || value < 0) throw new TypeError("metric observation must be finite and non-negative");
    const labelText = this.labelText(labels);
    const key = `${name}\u0000${labelText}`;
    const current = this.histograms.get(key) ?? {
      labels: labelText,
      buckets: [5, 10, 25, 50, 100, 250, 500, 1_000, 2_500, 5_000, 10_000],
      counts: Array(11).fill(0) as number[],
      sum: 0,
      count: 0,
    };
    for (let index = 0; index < current.buckets.length; index += 1) {
      if (value <= current.buckets[index]!) current.counts[index] = current.counts[index]! + 1;
    }
    current.sum += value;
    current.count += 1;
    this.histograms.set(key, current);
  }

  render(): string {
    const counters = [...this.counters.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key} ${value}`);
    const histograms = [...this.histograms.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .flatMap(([key, histogram]) => {
        const name = key.slice(0, key.indexOf("\u0000"));
        const labels = histogram.labels.length === 0 ? "" : `${histogram.labels},`;
        return [
          ...histogram.buckets.map((bucket, index) => `${name}_bucket{${labels}le="${bucket}"} ${histogram.counts[index]}`),
          `${name}_bucket{${labels}le="+Inf"} ${histogram.count}`,
          `${name}_sum${histogram.labels.length === 0 ? "" : `{${histogram.labels}}`} ${histogram.sum}`,
          `${name}_count${histogram.labels.length === 0 ? "" : `{${histogram.labels}}`} ${histogram.count}`,
        ];
      });
    return [...counters, ...histograms].join("\n") + "\n";
  }

  private labelText(labels: Readonly<Record<string, string>>): string {
    return Object.entries(labels)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, label]) => `${key}="${label.replace(/\\/gu, "\\\\").replace(/"/gu, '\\"')}"`)
      .join(",");
  }
}
