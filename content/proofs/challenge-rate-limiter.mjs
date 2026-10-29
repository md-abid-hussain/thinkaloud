// Proofs for the predict and trace keys of challenge-rate-limiter. Each function simulates the timeline the
// prompt describes, request by request, and returns the answer. import-content.mjs --check runs them and compares.
// No command-line tool in Git Bash computes rate limits, so these simulations are the only proof. Times are in
// seconds; every boundary rule stated in a prompt is written out in the helper that applies it.

// Token bucket with refill at whole-second ticks. The bucket starts full at time 0, one token is added at
// each whole second after 0 (1, 2, 3 ...), and a token added to a full bucket is thrown away.
// `bursts` is a list of [time, how many requests at that instant]. Returns the accepted count per burst.
function tokenBucket({ capacity, perTick }, bursts) {
  let tokens = capacity;
  let lastTick = 0;
  return bursts.map(([time, count]) => {
    const ticks = Math.floor(time) - lastTick;
    tokens = Math.min(capacity, tokens + ticks * perTick);
    lastTick = Math.floor(time);
    let accepted = 0;
    for (let i = 0; i < count; i++) {
      if (tokens >= 1) {
        tokens -= 1;
        accepted++;
      }
    }
    return accepted;
  });
}

// Fixed window counter. A request at time t belongs to the window starting at the floor of t / size times size,
// so a request exactly on a boundary belongs to the new window. Only accepted requests are counted.
function fixedWindow({ size, limit }, times) {
  const counts = new Map();
  return times.map((t) => {
    const start = Math.floor(t / size) * size;
    const used = counts.get(start) ?? 0;
    if (used >= limit) return false;
    counts.set(start, used + 1);
    return true;
  });
}

// Sliding window log. Before each request, entries at or before t - size are removed (an entry exactly one
// window old has expired). The request is accepted if fewer than `limit` entries remain, and only accepted
// requests are written to the log.
function slidingLog({ size, limit }, times) {
  let log = [];
  return times.map((t) => {
    log = log.filter((entry) => entry > t - size);
    if (log.length >= limit) return false;
    log.push(t);
    return true;
  });
}

// Sliding window counter estimate: current count plus the previous count weighted by the part of the previous
// window still inside the last `size` seconds. Integer arithmetic, so no rounding question arises.
function estimate({ size }, { previous, current, now }) {
  const elapsed = now % size;
  return current + (previous * (size - elapsed)) / size;
}

// A burst of `count` requests at one instant against a sliding window counter. A request is accepted when the
// estimate before it is below the limit, and each accepted request adds one to the current count.
function slidingCounterBurst({ size, limit }, { previous, current, now, count }) {
  let accepted = 0;
  for (let i = 0; i < count; i++) {
    if (estimate({ size }, { previous, current, now }) < limit) {
      current++;
      accepted++;
    }
  }
  return accepted;
}

// Two servers that read the shared count, check it, and write count plus one, run as a list of steps in the
// stated order. Each server keeps the value it read in its own local variable.
function readCheckWrite(store, limit, schedule) {
  const seen = {};
  let accepted = 0;
  for (const [server, step] of schedule) {
    if (step === 'read') seen[server] = store.count;
    if (step === 'check-write' && seen[server] < limit) {
      accepted++;
      store.count = seen[server] + 1;
    }
  }
  return [accepted, store.count];
}

export const proofs = {
  '1.1': () => tokenBucket({ capacity: 3, perTick: 1 }, [[0, 5]])[0],
  '1.2': () => tokenBucket({ capacity: 10, perTick: 1 }, [[0, 13], [2.5, 3]]),
  '2.1': () => fixedWindow({ size: 10, limit: 3 }, [2, 5, 8, 9, 10, 11]).filter(Boolean).length,
  '2.2': () => fixedWindow({ size: 60, limit: 5 }, [58, 58, 58, 58, 58, 61, 61, 61, 61, 61]).filter(Boolean).length,
  '2.3': () => {
    const times = [0, 4, 8, 10, 12, 14];
    const result = slidingLog({ size: 10, limit: 3 }, times);
    return times[result.indexOf(false)];
  },
  '3.1': () => estimate({ size: 60 }, { previous: 8, current: 3, now: 75 }),
  '3.2': () => [
    slidingCounterBurst({ size: 10, limit: 10 }, { previous: 10, current: 0, now: 12, count: 5 }),
    fixedWindow({ size: 10, limit: 10 }, [12, 12, 12, 12, 12]).filter(Boolean).length,
  ],
  '3.3': () => readCheckWrite({ count: 2 }, 3, [['A', 'read'], ['B', 'read'], ['A', 'check-write'], ['B', 'check-write']]),
};
