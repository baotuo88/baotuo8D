import { useMemo, useState } from "react";

const STATUS_OPTIONS = [
  { value: "", label: "全部状态" },
  { value: "draft", label: "草稿" },
  { value: "review", label: "评审中" },
  { value: "closed", label: "已关闭" }
];

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

function statusLabel(status) {
  if (status === "review") {
    return "评审中";
  }
  if (status === "closed") {
    return "已关闭";
  }
  return "草稿";
}

function countFilledSteps(report) {
  return ["d1", "d2", "d3", "d4", "d5", "d6", "d7", "d8"].filter((key) =>
    String(report?.[key] ?? "").trim()
  ).length;
}

function formatDate(value) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString();
}

export default function EightDListPage({
  reports,
  loading,
  statusFilter,
  onChangeStatusFilter,
  onCreateReport,
  onSelectReport
}) {
  const [draft, setDraft] = useState(emptyDraft);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState("");

  const stats = useMemo(() => {
    return {
      total: reports.length,
      draft: reports.filter((item) => item.status === "draft").length,
      review: reports.filter((item) => item.status === "review").length,
      closed: reports.filter((item) => item.status === "closed").length
    };
  }, [reports]);

  async function handleCreate(event) {
    event.preventDefault();
    setCreating(true);
    setMessage("");

    try {
      await onCreateReport(draft);
      setDraft(emptyDraft);
      setMessage("已创建新 8D 草稿。");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
      <section className="rounded-[28px] border border-stone-200 bg-white p-5 shadow-[0_1px_0_rgba(28,25,23,0.03)]">
        <div className="mb-5">
          <p className="text-[11px] uppercase tracking-[0.24em] text-stone-400">Create</p>
          <h2 className="mt-2 font-serif text-2xl tracking-tight text-stone-900">新建 8D 草稿</h2>
          <p className="mt-2 text-sm leading-6 text-stone-500">
            当前后端的 8D 详情采用 8 个步骤字段存储，这里先创建草稿，后续再进入详情页逐步完善。
          </p>
        </div>

        <form onSubmit={handleCreate} className="space-y-4">
          <label className="block space-y-2">
            <span className="text-sm font-medium text-stone-700">标题</span>
            <input
              required
              value={draft.title}
              onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
              className="w-full rounded-2xl border border-stone-200 bg-[#fcfbf8] px-4 py-3 text-sm outline-none transition focus:border-stone-400"
              placeholder="例如：控制器装配扭矩异常"
            />
          </label>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
            {[
              { key: "d1", label: "D1 团队" },
              { key: "d2", label: "D2 问题" },
              { key: "d3", label: "D3 围堵" },
              { key: "d4", label: "D4 根因" }
            ].map((field) => (
              <label key={field.key} className="block space-y-2">
                <span className="text-sm font-medium text-stone-700">{field.label}</span>
                <textarea
                  rows={3}
                  value={draft[field.key]}
                  onChange={(event) =>
                    setDraft((prev) => ({ ...prev, [field.key]: event.target.value }))
                  }
                  className="w-full rounded-2xl border border-stone-200 bg-[#fcfbf8] px-4 py-3 text-sm outline-none transition focus:border-stone-400"
                  placeholder="可先留空，后续在详情页继续编辑"
                />
              </label>
            ))}
          </div>

          {message && (
            <div className="rounded-2xl border border-stone-200 bg-[#f7f6f3] px-4 py-3 text-sm text-stone-600">
              {message}
            </div>
          )}

          <button
            disabled={creating}
            type="submit"
            className="w-full rounded-2xl bg-stone-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-stone-800 disabled:opacity-60"
          >
            {creating ? "创建中..." : "创建草稿"}
          </button>
        </form>
      </section>

      <section className="space-y-4">
        <div className="rounded-[28px] border border-stone-200 bg-white p-5 shadow-[0_1px_0_rgba(28,25,23,0.03)]">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-stone-400">Overview</p>
              <h2 className="mt-2 font-serif text-3xl tracking-tight text-stone-900">8D 列表</h2>
            </div>

            <label className="block min-w-[180px] space-y-2">
              <span className="text-xs uppercase tracking-[0.22em] text-stone-400">状态筛选</span>
              <select
                value={statusFilter}
                onChange={(event) => onChangeStatusFilter(event.target.value)}
                className="w-full rounded-2xl border border-stone-200 bg-[#fcfbf8] px-4 py-3 text-sm outline-none transition focus:border-stone-400"
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-4">
            {[
              { label: "总数", value: stats.total },
              { label: "草稿", value: stats.draft },
              { label: "评审中", value: stats.review },
              { label: "已关闭", value: stats.closed }
            ].map((item) => (
              <div key={item.label} className="rounded-2xl bg-[#f7f6f3] px-4 py-4">
                <p className="text-xs uppercase tracking-[0.22em] text-stone-400">{item.label}</p>
                <p className="mt-2 font-serif text-3xl tracking-tight text-stone-900">{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-[28px] border border-stone-200 bg-white shadow-[0_1px_0_rgba(28,25,23,0.03)]">
          <div className="grid grid-cols-[1.4fr_0.8fr_0.8fr_0.8fr] gap-3 border-b border-stone-200 px-5 py-4 text-xs uppercase tracking-[0.24em] text-stone-400">
            <span>标题</span>
            <span>状态</span>
            <span>步骤完成</span>
            <span>更新时间</span>
          </div>

          {loading ? (
            <div className="px-5 py-10 text-sm text-stone-500">正在加载 8D 列表...</div>
          ) : reports.length === 0 ? (
            <div className="px-5 py-10 text-sm text-stone-500">当前没有符合条件的 8D 报告。</div>
          ) : (
            reports.map((report) => (
              <button
                key={report.id}
                type="button"
                onClick={() => onSelectReport(report.id)}
                className="grid w-full grid-cols-[1.4fr_0.8fr_0.8fr_0.8fr] gap-3 border-b border-stone-100 px-5 py-4 text-left transition last:border-b-0 hover:bg-[#fcfbf8]"
              >
                <div>
                  <p className="text-sm font-medium text-stone-900">{report.title}</p>
                  <p className="mt-1 text-xs text-stone-400">{report.creator?.name || "未知创建人"}</p>
                </div>
                <div className="text-sm text-stone-600">{statusLabel(report.status)}</div>
                <div className="text-sm text-stone-600">{countFilledSteps(report)}/8</div>
                <div className="text-sm text-stone-500">{formatDate(report.timestamps?.updatedAt)}</div>
              </button>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
