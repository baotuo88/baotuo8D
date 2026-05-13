import { useEffect, useState } from "react";
import { SkeletonCard } from "./Skeleton";
import { Field } from "./shared";

const initialForm = {
  chat_api_key: "",
  chat_base_url: "",
  chat_model: "",
  embed_api_key: "",
  embed_base_url: "",
  embed_model: ""
};

function toForm(config) {
  if (!config) {
    return initialForm;
  }

  return {
    chat_api_key: "",
    chat_base_url: config.chat_base_url || "",
    chat_model: config.chat_model || "",
    embed_api_key: "",
    embed_base_url: config.embed_base_url || "",
    embed_model: config.embed_model || ""
  };
}

function TestResultPanel({ result }) {
  if (!result) {
    return null;
  }

  if (result.success) {
    const models = result.models || [];
    return (
      <div className="flex-1 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm">
        <p className="font-medium text-emerald-800">
          连接成功 {result.provider ? `— ${result.provider}` : ""}
        </p>
        <p className="mt-1 text-emerald-700">
          可用模型 ({models.length}):
          {models.length > 0 ? (
            <span className="ml-1 font-mono text-xs">
              {models.map((m) => m.id).join(", ")}
            </span>
          ) : (
            " 无"
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm">
      <p className="font-medium text-red-800">连接失败</p>
      <p className="mt-1 text-red-700">{result.error}</p>
    </div>
  );
}

export default function AiConfigPage({ config, loading, onReload, onSave, onTest }) {
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [testLoading, setTestLoading] = useState(false);
  const [testType, setTestType] = useState(null);
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    setForm(toForm(config));
  }, [config]);

  useEffect(() => {
    if (!config) {
      onReload().catch(() => {});
    }
  }, [config]);

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");

    try {
      const saved = await onSave(form);
      setForm(toForm(saved));
      setMessage("AI 配置已更新。");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleTest(type) {
    setTestLoading(true);
    setTestType(type);
    setTestResult(null);

    try {
      const fieldPrefix = type === "chat" ? "chat" : "embed";
      const result = await onTest({
        type,
        base_url: form[`${fieldPrefix}_base_url`],
        api_key: form[`${fieldPrefix}_api_key`]
      });
      setTestResult({ ...result, type });
    } catch (error) {
      setTestResult({ success: false, error: error.message, type });
    } finally {
      setTestLoading(false);
      setTestType(null);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Admin Console</p>
        <h2 className="mt-2 font-serif text-3xl tracking-tight text-slate-900">AI 配置页</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          这里维护聊天模型和向量模型的运行时配置。已存在的密钥不会回显，留空表示不更新。
        </p>

        <form onSubmit={handleSubmit} className="mt-6 grid gap-4">
          <Field label="聊天模型 API Key" hint="留空则保留现有值。">
            <input
              type="password"
              value={form.chat_api_key}
              onChange={(event) => setForm((prev) => ({ ...prev, chat_api_key: event.target.value }))}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-400"
              placeholder="sk-..."
            />
          </Field>

          <Field label="聊天模型 Base URL">
            <input
              value={form.chat_base_url}
              onChange={(event) => setForm((prev) => ({ ...prev, chat_base_url: event.target.value }))}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-400"
              placeholder="https://api.openai.com/v1"
            />
          </Field>

          <Field label="聊天模型 Model">
            <input
              value={form.chat_model}
              onChange={(event) => setForm((prev) => ({ ...prev, chat_model: event.target.value }))}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-400"
              placeholder="gpt-4o-mini"
            />
          </Field>

          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={testLoading || !form.chat_base_url}
              onClick={() => handleTest("chat")}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
            >
              {testLoading && testType === "chat" ? "测试中..." : "测试连接"}
            </button>
            {testResult?.type === "chat" && (
              <TestResultPanel result={testResult} />
            )}
          </div>

          <Field label="Embedding API Key" hint="留空则保留现有值。">
            <input
              type="password"
              value={form.embed_api_key}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, embed_api_key: event.target.value }))
              }
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-400"
              placeholder="sk-..."
            />
          </Field>

          <Field label="Embedding Base URL">
            <input
              value={form.embed_base_url}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, embed_base_url: event.target.value }))
              }
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-400"
              placeholder="https://api.openai.com/v1"
            />
          </Field>

          <Field label="Embedding Model">
            <input
              value={form.embed_model}
              onChange={(event) => setForm((prev) => ({ ...prev, embed_model: event.target.value }))}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-400"
              placeholder="text-embedding-3-small"
            />
          </Field>

          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={testLoading || !form.embed_base_url}
              onClick={() => handleTest("embed")}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
            >
              {testLoading && testType === "embed" ? "测试中..." : "测试连接"}
            </button>
            {testResult?.type === "embed" && (
              <TestResultPanel result={testResult} />
            )}
          </div>

          {message && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              {message}
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              disabled={submitting}
              type="submit"
              className="rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              {submitting ? "保存中..." : "保存配置"}
            </button>
            <button
              type="button"
              onClick={() => onReload()}
              className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
            >
              刷新配置
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Current Snapshot</p>
        <h3 className="mt-2 font-serif text-2xl tracking-tight text-slate-900">当前配置概览</h3>

        {loading ? (
          <div className="mt-6 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-2xl bg-slate-50 px-4 py-4">
                <div className="h-3 w-16 animate-pulse rounded bg-slate-200" />
                <div className="mt-3 h-4 w-32 animate-pulse rounded bg-slate-200" />
              </div>
            ))}
          </div>
        ) : !config ? (
          <p className="mt-6 text-sm text-slate-500">暂无配置数据。</p>
        ) : (
          <div className="mt-6 space-y-3">
            {[
              ["聊天模型", config.chat_model],
              ["聊天 Base URL", config.chat_base_url],
              ["聊天 Key", config.chat_api_key_masked || "未配置"],
              ["向量模型", config.embed_model],
              ["向量 Base URL", config.embed_base_url],
              ["向量 Key", config.embed_api_key_masked || "未配置"]
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl bg-slate-50 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-400">{label}</p>
                <p className="mt-2 break-all text-sm text-slate-700">{value || "-"}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
