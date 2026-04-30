const buckets = [50, 100, 200, 500, 1000, 2000, 5000, 10000];

const state = {
  startedAt: Date.now(),
  totalRequests: 0,
  totalErrors: 0,
  byRoute: new Map(),
  byStatus: new Map(),
  byMethod: new Map(),
  durationBuckets: new Map(),
  durationCount: 0,
  durationSumMs: 0
};

for (const bucket of buckets) {
  state.durationBuckets.set(bucket, 0);
}
state.durationBuckets.set("+Inf", 0);

function inc(map, key, amount = 1) {
  map.set(key, (map.get(key) || 0) + amount);
}

export function recordRequest({ method, path, statusCode, durationMs }) {
  state.totalRequests += 1;

  if (statusCode >= 500) {
    state.totalErrors += 1;
  }

  inc(state.byRoute, `${method} ${path}`);
  inc(state.byStatus, String(statusCode));
  inc(state.byMethod, method);

  state.durationCount += 1;
  state.durationSumMs += durationMs;

  let matched = false;
  for (const bucket of buckets) {
    if (durationMs <= bucket) {
      inc(state.durationBuckets, bucket);
      matched = true;
      break;
    }
  }

  if (!matched) {
    inc(state.durationBuckets, "+Inf");
  }
}

function linesFromMap(metricName, help, map, labelName) {
  const lines = [`# HELP ${metricName} ${help}`, `# TYPE ${metricName} counter`];
  for (const [key, value] of map.entries()) {
    lines.push(`${metricName}{${labelName}="${String(key).replace(/"/g, '\\"')}"} ${value}`);
  }
  return lines;
}

export function renderPrometheusMetrics() {
  const uptime = Math.max((Date.now() - state.startedAt) / 1000, 0);
  const durationAvg = state.durationCount > 0 ? state.durationSumMs / state.durationCount : 0;

  const lines = [
    "# HELP app_uptime_seconds Application uptime in seconds",
    "# TYPE app_uptime_seconds gauge",
    `app_uptime_seconds ${uptime.toFixed(3)}`,
    "# HELP http_requests_total Total HTTP requests",
    "# TYPE http_requests_total counter",
    `http_requests_total ${state.totalRequests}`,
    "# HELP http_errors_total Total HTTP 5xx responses",
    "# TYPE http_errors_total counter",
    `http_errors_total ${state.totalErrors}`,
    "# HELP http_request_duration_ms_avg Average HTTP request duration in ms",
    "# TYPE http_request_duration_ms_avg gauge",
    `http_request_duration_ms_avg ${durationAvg.toFixed(3)}`,
    "# HELP http_request_duration_ms_bucket Duration bucket counts in ms",
    "# TYPE http_request_duration_ms_bucket counter"
  ];

  for (const bucket of buckets) {
    lines.push(`http_request_duration_ms_bucket{le="${bucket}"} ${state.durationBuckets.get(bucket) || 0}`);
  }
  lines.push(`http_request_duration_ms_bucket{le="+Inf"} ${state.durationBuckets.get("+Inf") || 0}`);

  lines.push(...linesFromMap("http_requests_by_method_total", "HTTP requests by method", state.byMethod, "method"));
  lines.push(...linesFromMap("http_requests_by_status_total", "HTTP requests by status", state.byStatus, "status"));
  lines.push(...linesFromMap("http_requests_by_route_total", "HTTP requests by route", state.byRoute, "route"));

  return `${lines.join("\n")}\n`;
}
