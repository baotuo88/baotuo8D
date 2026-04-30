import process from "process";

const baseUrl = String(process.env.SMOKE_BASE_URL || "http://127.0.0.1:8080/api").replace(/\/+$/, "");
const email = process.env.SMOKE_USER_EMAIL || `smoke_${Date.now()}@example.com`;
const password = process.env.SMOKE_USER_PASSWORD || "SmokePassw0rd!";
const name = process.env.SMOKE_USER_NAME || "Smoke User";

async function requestJson(path, { method = "GET", token = "", body } = {}) {
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

  return {
    ok: response.ok,
    status: response.status,
    data
  };
}

function assertOk(result, message) {
  if (!result.ok) {
    throw new Error(`${message} failed (${result.status}): ${JSON.stringify(result.data)}`);
  }
}

async function run() {
  const health = await requestJson("/health");
  assertOk(health, "health check");

  const register = await requestJson("/auth/register", {
    method: "POST",
    body: { name, email, password, role: "user" }
  });
  if (!register.ok && register.status !== 409) {
    throw new Error(`register failed (${register.status}): ${JSON.stringify(register.data)}`);
  }

  const login = await requestJson("/auth/login", {
    method: "POST",
    body: { email, password }
  });
  assertOk(login, "login");

  const token = login.data?.data?.token;
  if (!token) {
    throw new Error("login succeeded but token is missing");
  }

  const me = await requestJson("/auth/me", {
    token
  });
  assertOk(me, "auth/me");

  console.log(
    JSON.stringify(
      {
        status: "ok",
        baseUrl,
        checks: ["health", "register/login", "auth/me"],
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
