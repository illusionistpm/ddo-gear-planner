export function perfEnabled() {
  try {
    return localStorage.getItem('ddoPerf') === '1';
  } catch {
    return false;
  }
}

export function perfStart(label: string) {
  if (!perfEnabled()) {
    return () => {};
  }

  const start = performance.now();
  console.log(`[ddo-perf] ${label} start`);
  return (extra?: unknown) => {
    const elapsed = (performance.now() - start).toFixed(1);
    if (extra === undefined) {
      console.log(`[ddo-perf] ${label} ${elapsed}ms`);
    } else {
      console.log(`[ddo-perf] ${label} ${elapsed}ms ${JSON.stringify(extra)}`);
    }
  };
}

export function perfMeasure<T>(label: string, fn: () => T): T {
  const done = perfStart(label);
  try {
    return fn();
  } finally {
    done();
  }
}

type PerfAggregate = {
  count: number;
  totalMs: number;
  maxMs: number;
  extraTotals: Record<string, number>;
};

const timingAggregates = new Map<string, PerfAggregate>();
let timingAggregateFlushScheduled = false;

export function perfAggregateStart(label: string) {
  if (!perfEnabled()) {
    return () => {};
  }

  const start = performance.now();
  return (extra?: Record<string, number>) => {
    const elapsed = performance.now() - start;
    let aggregate = timingAggregates.get(label);
    if (!aggregate) {
      aggregate = { count: 0, totalMs: 0, maxMs: 0, extraTotals: {} };
      timingAggregates.set(label, aggregate);
    }

    aggregate.count++;
    aggregate.totalMs += elapsed;
    aggregate.maxMs = Math.max(aggregate.maxMs, elapsed);

    if (extra) {
      for (const [key, value] of Object.entries(extra)) {
        aggregate.extraTotals[key] = (aggregate.extraTotals[key] || 0) + value;
      }
    }

    scheduleTimingAggregateFlush();
  };
}

function scheduleTimingAggregateFlush() {
  if (timingAggregateFlushScheduled) {
    return;
  }

  timingAggregateFlushScheduled = true;
  scheduleFrame(() => {
    scheduleFrame(() => {
      timingAggregateFlushScheduled = false;
      if (!timingAggregates.size) {
        return;
      }

      const summary = Array.from(timingAggregates.entries())
        .sort((left, right) => right[1].totalMs - left[1].totalMs)
        .reduce((accum: Record<string, Record<string, number>>, [key, value]) => {
          accum[key] = {
            count: value.count,
            totalMs: Number(value.totalMs.toFixed(1)),
            avgMs: Number((value.totalMs / value.count).toFixed(1)),
            maxMs: Number(value.maxMs.toFixed(1)),
            ...value.extraTotals
          };
          return accum;
        }, {});
      timingAggregates.clear();
      console.log('[ddo-perf] timing totals ' + JSON.stringify(summary));
    });
  });
}

export function perfMark(label: string, extra?: unknown) {
  if (!perfEnabled()) {
    return;
  }

  if (extra === undefined) {
    console.log(`[ddo-perf] ${label}`);
  } else {
    console.log(`[ddo-perf] ${label} ${JSON.stringify(extra)}`);
  }
}

export function perfAfterFrames(label: string) {
  if (!perfEnabled()) {
    return;
  }

  const start = performance.now();
  scheduleFrame(() => {
    scheduleFrame(() => {
      console.log(`[ddo-perf] ${label} ${((performance.now() - start)).toFixed(1)}ms`);
    });
  });
}

const counters = new Map<string, number>();
let counterFlushScheduled = false;

export function perfCount(label: string) {
  if (!perfEnabled()) {
    return;
  }

  counters.set(label, (counters.get(label) || 0) + 1);
  if (counterFlushScheduled) {
    return;
  }

  counterFlushScheduled = true;
  scheduleFrame(() => {
    scheduleFrame(() => {
      counterFlushScheduled = false;
      if (!counters.size) {
        return;
      }

      const summary = Array.from(counters.entries())
        .sort((left, right) => right[1] - left[1])
        .reduce((accum: Record<string, number>, [key, value]) => {
          accum[key] = value;
          return accum;
        }, {});
      counters.clear();
      console.log('[ddo-perf] call counts ' + JSON.stringify(summary));
    });
  });
}

function scheduleFrame(callback: FrameRequestCallback) {
  const nativeRequestAnimationFrame = (window as any).__zone_symbol__requestAnimationFrame as typeof requestAnimationFrame | undefined;
  (nativeRequestAnimationFrame || requestAnimationFrame)(callback);
}
