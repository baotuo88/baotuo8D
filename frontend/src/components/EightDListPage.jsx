import { useEffect, useMemo, useState } from "react";

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
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState("updated_desc");
  const [page, setPage] = useState(1);
  const pageSize = 8;

  useEffect(() => {
    setPage(1);
  }, [query, statusFilter, sortBy, reports.length]);

  const stats = useMemo(() => {
    return {
      total: reports.length,
      draft: reports.filter((item) => item.status === "draft").length,
      review: reports.filter((item) => item.status === "review").length,
      closed: reports.filter((item) => item.status === "closed").length
    };
  }, [reports]);

  const visibleReports = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const filtered = reports.filter((report) => {
      if (!keyword) {
        return true;
      }

      return [report.title, report.creator?.name, report.creator?.email, report.status]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword));
    });

    const sorted = [...filtered].sort((a, b) => {
      const at = new Date(a.timestamps?.updatedAt || 0).getTime();
      const bt = new Date(b.timestamps?.updatedAt || 0).getTime();
      if (sortBy === "updated_asc") {
        return at - bt;
      }
      if (sortBy === "title_asc") {
        return String(a.title || "").localeCompare(String(b.title || ""), "zh-Hans");
      }
      if (sortBy === "title_desc") {
        return String(b.title || "").localeCompare(String(a.title || ""), "zh-Hans");
      }
      return bt - at;
    });

    const start = (page - 1) * pageSize;
    return {
      filtered,
      sorted,
      pageItems: sorted.slice(start, start + pageSize),
      pageCount: Math.max(1, Math.ceil(sorted.length / pageSize))
    };
  }, [reports, query, sortBy, page]);

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
    <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
        <div className="mb-5">
          <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Create</p>
          <h2 className="mt-2 font-serif text-2xl tracking-tight text-slate-900">新建 8D 草稿</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            先录入标题与关键信息，后续在详情页按 D1-D8 完成完整闭环。
          </p>
        </div>

        <form onSubmit={handleCreate} className="space-y-4">
          <label className="block space-y-2">
            <span className="text-sm font-medium text-stone-700">标题</span>
            <input
              required
              value={draft.title}
              onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-400"
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
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-400"
                  placeholder="可先留空，后续在详情页继续编辑"
                />
              </label>
            ))}
          </div>

          {message && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              {message}
            </div>
          )}

          <button
            disabled={creating}
            type="submit"
            className="w-full rounded-2xl bg-[#1f2937] px-4 py-3 text-sm font-medium text-white transition hover:bg-[#111827] disabled:opacity-60"
          >
            {creating ? "创建中..." : "创建草稿"}
          </button>
        </form>
      </section>

      <section className="space-y-4">
        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Overview</p>
              <h2 className="mt-2 font-serif text-3xl tracking-tight text-slate-900">8D 报告中心</h2>
            </div>

            <div className="grid gap-3 md:min-w-[520px] md:grid-cols-3">
              <label className="block space-y-2">
                <span className="text-xs uppercase tracking-[0.22em] text-slate-500">状态筛选</span>
                <select
                  value={statusFilter}
                  onChange={(event) => onChangeStatusFilter(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-400"
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-2">
                <span className="text-xs uppercase tracking-[0.22em] text-slate-500">搜索</span>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-400"
                  placeholder="标题 / 创建人 / 邮箱"
                />
              </label>
              <label className="block space-y-2">
                <span className="text-xs uppercase tracking-[0.22em] text-slate-500">排序</span>
                <select
                  value={sortBy}
                  onChange={(event) => setSortBy(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-400"
                >
                  <option value="updated_desc">更新时间 新到旧</option>
                  <option value="updated_asc">更新时间 旧到新</option>
                  <option value="title_asc">标题 A-Z</option>
                  <option value="title_desc">标题 Z-A</option>
                </select>
              </label>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-4">
            {[
              { label: "总数", value: stats.total },
              { label: "草稿", value: stats.draft },
              { label: "评审中", value: stats.review },
              { label: "已关闭", value: stats.closed }
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-500">{item.label}</p>
                <p className="mt-2 font-serif text-3xl tracking-tight text-slate-900">{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
          <div className="hidden grid-cols-[1.4fr_0.8fr_0.8fr_0.8fr] gap-3 border-b border-slate-200 px-5 py-4 text-xs uppercase tracking-[0.24em] text-slate-500 md:grid">
            <span>标题</span>
            <span>状态</span>
            <span>步骤完成</span>
            <span>更新时间</span>
          </div>

          {loading ? (
            <div className="px-5 py-10 text-sm text-stone-500">正在加载 8D 列表...</div>
          ) : visibleReports.filtered.length === 0 ? (
            <div className="px-5 py-10 text-sm text-stone-500">当前没有符合条件的 8D 报告。</div>
          ) : (
            visibleReports.pageItems.map((report) => (
              <button
                key={report.id}
                type="button"
                onClick={() => onSelectReport(report.id)}
                className="grid w-full gap-3 border-b border-slate-100 px-5 py-4 text-left transition last:border-b-0 hover:bg-slate-50 md:grid-cols-[1.4fr_0.8fr_0.8fr_0.8fr]"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">{report.title}</p>
                  <p className="mt-1 text-xs text-slate-500">{report.creator?.name || "未知创建人"}</p>
                </div>
                <div className="text-sm text-slate-700">{statusLabel(report.status)}</div>
                <div className="text-sm text-slate-700">{countFilledSteps(report)}/8</div>
                <div className="text-sm text-slate-600">{formatDate(report.timestamps?.updatedAt)}</div>
              </button>
            ))
          )}
        </div>

        {!loading && visibleReports.filtered.length > 0 && (
          <div className="flex items-center justify-between rounded-[24px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-[0_16px_40px_rgba(15,23,42,0.04)]">
            <span>
              第 {page} / {visibleReports.pageCount} 页，共 {visibleReports.filtered.length} 条
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 disabled:opacity-50"
              >
                上一页
              </button>
              <button
                type="button"
                disabled={page >= visibleReports.pageCount}
                onClick={() => setPage((prev) => Math.min(visibleReports.pageCount, prev + 1))}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 disabled:opacity-50"
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
