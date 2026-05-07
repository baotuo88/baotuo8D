import { test } from "node:test";
import assert from "node:assert/strict";

const baseUrl = String(process.env.TEST_BASE_URL || "http://127.0.0.1:8080/api").replace(/\/+$/, "");
const testRunId = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

async function apiRequest(path, { method = "GET", token = "", body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const rawText = await response.text();
  let payload = null;

  try {
    payload = rawText ? JSON.parse(rawText) : null;
  } catch {
    payload = { raw: rawText };
  }

  return {
    ok: response.ok,
    status: response.status,
    body: payload
  };
}

async function createUserAndLogin(role = "user") {
  const email = `baseline_${role}_${testRunId}_${Math.floor(Math.random() * 1e6)}@example.com`;
  const password = "BaselinePassw0rd!";
  const name = role === "admin" ? "Baseline Admin" : "Baseline User";

  const registerPayload = {
    name,
    email,
    password,
    role
  };

  if (role === "admin") {
    registerPayload.adminRegisterToken = String(process.env.TEST_ADMIN_REGISTER_TOKEN || "");
  }

  const register = await apiRequest("/auth/register", {
    method: "POST",
    body: registerPayload
  });

  assert.equal(register.ok, true, `register failed: ${register.status} ${JSON.stringify(register.body)}`);

  const login = await apiRequest("/auth/login", {
    method: "POST",
    body: { email, password }
  });

  assert.equal(login.ok, true, `login failed: ${login.status} ${JSON.stringify(login.body)}`);
  assert.equal(typeof login.body?.data?.token, "string");

  return {
    token: login.body.data.token,
    user: login.body.data.user
  };
}

test("GET /health should return ok", async () => {
  const health = await apiRequest("/health");
  assert.equal(health.ok, true, `health failed: ${health.status} ${JSON.stringify(health.body)}`);
  assert.equal(health.body?.status, "ok");
  assert.equal(health.body?.checks?.database, "ok");
});

test("auth register/login/me flow should work", async () => {
  const session = await createUserAndLogin("user");

  const me = await apiRequest("/auth/me", { token: session.token });
  assert.equal(me.ok, true, `auth/me failed: ${me.status} ${JSON.stringify(me.body)}`);
  assert.equal(me.body?.data?.email, session.user.email);
});

test("auth/me without token should return 401", async () => {
  const me = await apiRequest("/auth/me");
  assert.equal(me.status, 401);
});

test("8D report create/list/detail as user should work", async () => {
  const session = await createUserAndLogin("user");

  const create = await apiRequest("/8d-reports", {
    method: "POST",
    token: session.token,
    body: {
      title: `Baseline 8D ${testRunId}`,
      d1: "D1 content"
    }
  });

  assert.equal(create.status, 201, `create failed: ${create.status} ${JSON.stringify(create.body)}`);
  const reportId = create.body?.data?.id;
  assert.equal(typeof reportId, "string");

  const list = await apiRequest("/8d-reports", { token: session.token });
  assert.equal(list.ok, true, `list failed: ${list.status} ${JSON.stringify(list.body)}`);
  assert.equal(Array.isArray(list.body?.data), true);
  assert.equal(list.body.data.some((item) => item.id === reportId), true);

  const detail = await apiRequest(`/8d-reports/${reportId}`, { token: session.token });
  assert.equal(detail.ok, true, `detail failed: ${detail.status} ${JSON.stringify(detail.body)}`);
  assert.equal(detail.body?.data?.id, reportId);
});

test("8D status transition: creator can submit review, non-admin cannot close", async () => {
  const creator = await createUserAndLogin("user");

  const create = await apiRequest("/8d-reports", {
    method: "POST",
    token: creator.token,
    body: {
      title: `Flow 8D ${testRunId}`
    }
  });

  assert.equal(create.status, 201, `create failed: ${create.status} ${JSON.stringify(create.body)}`);
  const reportId = create.body?.data?.id;

  const submitReview = await apiRequest(`/8d-reports/${reportId}/status`, {
    method: "PATCH",
    token: creator.token,
    body: {
      status: "review",
      comment: "submit for review"
    }
  });

  assert.equal(submitReview.ok, true, `submit review failed: ${submitReview.status} ${JSON.stringify(submitReview.body)}`);
  assert.equal(submitReview.body?.data?.status, "review");

  const tryCloseByCreator = await apiRequest(`/8d-reports/${reportId}/status`, {
    method: "PATCH",
    token: creator.token,
    body: {
      status: "closed",
      comment: "creator trying close"
    }
  });

  assert.equal(tryCloseByCreator.status, 403);
});
