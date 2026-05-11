import { useState } from "react";

const emptyDraft = {
  title: "",
  d1: "",
  d2: "",
  d3: "",
  d4: "",
  d5: "",
  d6: "",
  d7: "",
  d8: ""
};

export default function EightDCreatePage({ onCreateReport, onCancel }) {
  const [draft, setDraft] = useState(emptyDraft);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState("");

  async function handleCreate(event) {
    event.preventDefault();
    if (creating) {
      return;
    }
    setCreating(true);
    setMessage("");

    try {
      await onCreateReport(draft);
      setDraft(emptyDraft);
      onCancel?.();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Create</p>
            <h2 className="mt-2 font-serif text-3xl tracking-tight text-slate-900">新建 8D 草稿</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              先录入标题与关键信息，后续在详情页按 D1-D8 完成完整闭环。
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="h-10 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
          >
            返回列表
          </button>
        </div>

        <form onSubmit={handleCreate} className="space-y-4">
          <label className="block space-y-2">
            <span className="text-sm font-medium text-slate-700">标题</span>
            <input
              required
              value={draft.title}
              onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-400"
              placeholder="例如：控制器装配扭矩异常"
            />
          </label>

          <div className="grid gap-3 md:grid-cols-2">
            {[
              { key: "d1", label: "D1 团队" },
              { key: "d2", label: "D2 问题" },
              { key: "d3", label: "D3 围堵" },
              { key: "d4", label: "D4 根因" }
            ].map((field) => (
              <label key={field.key} className="block space-y-2">
                <span className="text-sm font-medium text-slate-700">{field.label}</span>
                <textarea
                  rows={3}
                  value={draft[field.key]}
                  onChange={(event) =>
                    setDraft((prev) => ({ ...prev, [field.key]: event.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-400"
                  placeholder="可先留空，后续在详情页继续编辑"
                />
              </label>
            ))}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {[
              { key: "d5", label: "D5 永久对策" },
              { key: "d6", label: "D6 实施验证" },
              { key: "d7", label: "D7 防再发生" },
              { key: "d8", label: "D8 团队表彰" }
            ].map((field) => (
              <label key={field.key} className="block space-y-2">
                <span className="text-sm font-medium text-slate-700">{field.label}</span>
                <textarea
                  rows={3}
                  value={draft[field.key]}
                  onChange={(event) =>
                    setDraft((prev) => ({ ...prev, [field.key]: event.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-400"
                  placeholder="可先留空，后续在详情页继续编辑"
                />
              </label>
            ))}
          </div>

          {message && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              {message}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="h-11 rounded-lg border border-slate-200 bg-white px-5 text-sm text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
            >
              取消
            </button>
            <button
              disabled={creating}
              type="submit"
              className="h-11 rounded-lg bg-slate-900 px-6 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              {creating ? "创建中..." : "创建草稿"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
