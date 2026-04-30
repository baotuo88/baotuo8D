import process from "process";

const baseUrl = String(process.env.TEST_BASE_URL || "http://127.0.0.1:8080/api").replace(/\/+$/, "");
const metricsUrl = String(process.env.TEST_METRICS_URL || "http://127.0.0.1:8080/metrics");
const metricsToken = String(process.env.TEST_METRICS_TOKEN || "").trim();
const email = process.env.TEST_USER_EMAIL || `integration_${Date.now()}@example.com`;
const password = process.env.TEST_USER_PASSWORD || "IntegrationPassw0rd!";
const name = process.env.TEST_USER_NAME || "Integration User";

async function request(path, { method = "GET", token = "", body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });

  const text = await response.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch (_error) {
    data = { raw: text };
  }

  return { ok: response.ok, status: response.status, data };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function run() {
  const health = await request("/health");
  assert(health.ok, `health failed: ${JSON.stringify(health.data)}`);

  const register = await request("/auth/register", {
    method: "POST",
    body: { name, email, password, role: "user" }
  });
  assert(
    register.ok || register.status === 409,
    `register failed: ${register.status} ${JSON.stringify(register.data)}`
  );

  const login = await request("/auth/login", {
    method: "POST",
    body: { email, password }
  });
  assert(login.ok, `login failed: ${JSON.stringify(login.data)}`);

  const token = login.data?.data?.token;
  assert(token, "token missing");

  const me = await request("/auth/me", { token });
  assert(me.ok, `auth/me failed: ${JSON.stringify(me.data)}`);

  const ragLogs = await request("/rag/logs?limit=1", { token });
  assert(ragLogs.ok, `rag logs failed: ${JSON.stringify(ragLogs.data)}`);

  const metricsRes = await fetch(metricsUrl, {
    headers: metricsToken ? { Authorization: `Bearer ${metricsToken}` } : {}
  });
  const metricsText = await metricsRes.text();
  assert(metricsRes.ok, "metrics endpoint failed");
  assert(metricsText.includes("http_requests_total"), "metrics payload missing http_requests_total");

  console.log(
    JSON.stringify(
      {
        status: "ok",
        checks: ["health", "auth", "rag_logs", "metrics"],
        baseUrl,
        email
      },
      null,
      2
    )
  );
}

run().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
