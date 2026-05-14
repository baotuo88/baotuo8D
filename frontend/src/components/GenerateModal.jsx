import { useEffect, useState } from "react";

const initialForm = {
  title: "",
  product: "",
  problemType: "",
  process: "",
  problemStatement: "",
  impact: "",
  rootCauseHint: "",
  teamMembers: ""
};

function parseReportText(value) {
  return String(value ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export default function GenerateModal({ open, onClose, onGenerate, onSaveAsNew }) {
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    setForm(initialForm);
    setLoading(false);
    setSaving(false);
    setError("");
    setResult(null);

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const data = await onGenerate({
        ...form,
        teamMembers: form.teamMembers
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      });
      setResult(data);
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveAsNew() {
    if (!result?.report) {
      return;
    }

    setSaving(true);
    setError("");

    try {
      await onSaveAsNew(result.report);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-4 backdrop-blur-sm">
      <div className="grid h-[min(92vh,900px)] w-full max-w-7xl gap-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl xl:grid-cols-[420px_minmax(0,1fr)]">
        <section className="overflow-y-auto border-b border-slate-200 bg-slate-50 p-6 xl:border-b-0 xl:border-r">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">AI Generate</p>
              <h2 className="mt-2 font-serif text-3xl tracking-tight text-slate-900">高质量 8D 生成</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-500 transition hover:text-slate-900"
            >
              关闭
            </button>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {[
              ["title", "标题", "例如：控制器装配扭矩异常"],
              ["product", "产品", "例如：某型号控制器"],
              ["problemType", "问题类型", "例如：扭矩不足"],
              ["process", "工序", "例如：装配"]
            ].map(([key, label, placeholder]) => (
              <label key={key} className="block space-y-2">
                <span className="text-sm font-medium text-slate-700">{label}</span>
                <input
                  value={form[key]}
                  onChange={(event) => setForm((prev) => ({ ...prev, [key]: event.target.value }))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400"
                  placeholder={placeholder}
                  required={key === "title"}
                />
              </label>
            ))}

            {[
              ["problemStatement", "问题描述", 4],
              ["impact", "影响", 3],
              ["rootCauseHint", "根因线索", 3]
            ].map(([key, label, rows]) => (
              <label key={key} className="block space-y-2">
                <span className="text-sm font-medium text-slate-700">{label}</span>
                <textarea
                  value={form[key]}
                  onChange={(event) => setForm((prev) => ({ ...prev, [key]: event.target.value }))}
                  rows={rows}
                  className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm leading-6 outline-none transition focus:border-slate-400"
                  placeholder={`填写${label}`}
                  required={key === "problemStatement"}
                />
              </label>
            ))}

            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-700">团队成员</span>
              <input
                value={form.teamMembers}
                onChange={(event) => setForm((prev) => ({ ...prev, teamMembers: event.target.value }))}
                className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400"
                placeholder="QE,PE,ME"
              />
            </label>

            {error && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            )}

            <button
              disabled={loading}
              type="submit"
              className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              {loading ? "生成中..." : "开始生成"}
            </button>
          </form>
        </section>

        <section className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] bg-white">
          <div className="border-b border-slate-200 px-6 py-5">
            <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Generated Result</p>
            <h3 className="mt-2 font-serif text-2xl tracking-tight text-slate-900">生成结果</h3>
          </div>

          <div className="grid min-h-0 gap-0 xl:grid-cols-[1fr_420px]">
            <div className="min-h-0 overflow-y-auto border-b border-slate-200 p-6 xl:border-b-0 xl:border-r">
              {!result ? (
                <div className="flex h-full min-h-[320px] items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">
                  生成完成后，这里展示文本版 8D。
                </div>
              ) : (
                <div className="space-y-4">
                  <article className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                    <h4 className="font-serif text-2xl tracking-tight text-slate-900">
                      {result.report?.title || "未命名问题"}
                    </h4>
                    <div className="mt-4 space-y-2">
                      {parseReportText(result.report_text).map((line, index) => (
                        <p key={`${line}-${index}`} className="text-sm leading-7 text-slate-700">
                          {line}
                        </p>
                      ))}
                    </div>
                  </article>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleSaveAsNew}
                    className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
                  >
                    {saving ? "保存中..." : "另存为新 8D 报告"}
                  </button>
                </div>
              )}
            </div>

            <div className="min-h-0 overflow-y-auto bg-slate-50 p-6">
              {!result ? (
                <div className="flex h-full min-h-[320px] items-center justify-center rounded-lg border border-dashed border-slate-200 bg-white text-sm text-slate-500">
                  这里展示结构化 JSON。
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-200 bg-white p-5">
                    <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Style Summary</p>
                    <pre className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                      {result.style_summary}
                    </pre>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-5">
                    <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Structured JSON</p>
                    <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs leading-6 text-slate-700">
                      {JSON.stringify(result.report, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
