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
      console.log(`[ddo-perf] ${label} ${elapsed}ms`, extra);
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

export function perfMark(label: string, extra?: unknown) {
  if (!perfEnabled()) {
    return;
  }

  if (extra === undefined) {
    console.log(`[ddo-perf] ${label}`);
  } else {
    console.log(`[ddo-perf] ${label}`, extra);
  }
}

export function perfAfterFrames(label: string) {
  if (!perfEnabled()) {
    return;
  }

  const start = performance.now();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      console.log(`[ddo-perf] ${label} ${((performance.now() - start)).toFixed(1)}ms`);
    });
  });
}
