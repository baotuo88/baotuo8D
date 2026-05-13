import { useEffect, useMemo, useState } from "react";
import { SkeletonCard, SkeletonTable } from "./Skeleton";
import { StatusBadge, formatDate, statusLabel } from "./shared";

const STATUS_OPTIONS = [
  { value: "", label: "全部状态" },
  { value: "draft", label: "草稿" },
  { value: "review", label: "评审中" },
  { value: "closed", label: "已关闭" }
];

function countFilledSteps(report) {
  return ["d1", "d2", "d3", "d4", "d5", "d6", "d7", "d8"].filter((key) =>
    String(report?.[key] ?? "").trim()
  ).length;
}

export default function EightDListPage({
  reports,
  loading,
  statusFilter,
  initialListState,
  onChangeStatusFilter,
  onCreateNew,
  onSelectReport
}) {
  const [query, setQuery] = useState(initialListState?.query || "");
  const [sortBy, setSortBy] = useState(initialListState?.sortBy || "updated_desc");
  const [page, setPage] = useState(initialListState?.page || 1);
  const [creatorFilter, setCreatorFilter] = useState(initialListState?.creator || "");
  const [createdFrom, setCreatedFrom] = useState(initialListState?.createdFrom || "");
  const [createdTo, setCreatedTo] = useState(initialListState?.createdTo || "");
  const pageSize = 8;

  useEffect(() => {
    setQuery(initialListState?.query || "");
    setSortBy(initialListState?.sortBy || "updated_desc");
    setPage(initialListState?.page || 1);
    setCreatorFilter(initialListState?.creator || "");
    setCreatedFrom(initialListState?.createdFrom || "");
    setCreatedTo(initialListState?.createdTo || "");
  }, [
    initialListState?.query,
    initialListState?.sortBy,
    initialListState?.page,
    initialListState?.creator,
    initialListState?.createdFrom,
    initialListState?.createdTo
  ]);

  useEffect(() => {
    setPage(1);
  }, [query, statusFilter, sortBy, creatorFilter, createdFrom, createdTo, reports.length]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (statusFilter) {
      params.set("status", statusFilter);
    }
    if (query.trim()) {
      params.set("q", query.trim());
    }
    if (sortBy && sortBy !== "updated_desc") {
      params.set("sort", sortBy);
    }
    if (creatorFilter.trim()) {
      params.set("creator", creatorFilter.trim());
    }
    if (createdFrom) {
      params.set("from", createdFrom);
    }
    if (createdTo) {
      params.set("to", createdTo);
    }
    if (page > 1) {
      params.set("page", String(page));
    }
    const nextHash = params.toString() ? `/reports?${params.toString()}` : "/reports";
    if (window.location.hash.replace(/^#/, "") !== nextHash) {
      window.history.replaceState(null, "", `#${nextHash}`);
    }
  }, [statusFilter, query, sortBy, creatorFilter, createdFrom, createdTo, page]);

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

    const creatorKeyword = creatorFilter.trim().toLowerCase();
    const startTime = createdFrom ? new Date(`${createdFrom}T00:00:00`).getTime() : null;
    const endTime = createdTo ? new Date(`${createdTo}T23:59:59.999`).getTime() : null;

    const refined = filtered.filter((report) => {
      const creatorName = String(report.creator?.name || "").toLowerCase();
      const creatorEmail = String(report.creator?.email || "").toLowerCase();
      const updatedAt = new Date(report.timestamps?.updatedAt || 0).getTime();
      const createdAt = new Date(report.timestamps?.createdAt || 0).getTime();
      const creatorMatch =
        !creatorKeyword ||
        creatorName.includes(creatorKeyword) ||
        creatorEmail.includes(creatorKeyword);
      const fromMatch = !startTime || createdAt >= startTime || updatedAt >= startTime;
      const toMatch = !endTime || createdAt <= endTime || updatedAt <= endTime;
      return creatorMatch && fromMatch && toMatch;
    });

    const sorted = [...refined].sort((a, b) => {
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
      filtered: refined,
      sorted,
      pageItems: sorted.slice(start, start + pageSize),
      pageCount: Math.max(1, Math.ceil(sorted.length / pageSize))
    };
  }, [reports, query, sortBy, creatorFilter, createdFrom, createdTo, page]);

  if (loading) {
    return (
      <div className="space-y-6">
        <section className="space-y-4">
          <SkeletonCard rows={2} />
          <SkeletonTable rows={5} cols={4} />
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Overview</p>
                <h2 className="mt-2 font-serif text-3xl tracking-tight text-slate-900">8D 报告中心</h2>
              </div>
              <button
                type="button"
                onClick={onCreateNew}
                className="h-11 rounded-lg bg-slate-900 px-5 text-sm font-medium text-white transition hover:bg-slate-800"
              >
                新建草稿
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <label className="block space-y-2">
                <span className="text-xs uppercase tracking-[0.22em] text-slate-500">状态筛选</span>
                <select
                  value={statusFilter}
                  onChange={(event) => onChangeStatusFilter(event.target.value)}
                  className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition focus:border-slate-400"
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-2">
                <span className="text-xs uppercase tracking-[0.22em] text-slate-500">创建人</span>
                <input
                  value={creatorFilter}
                  onChange={(event) => setCreatorFilter(event.target.value)}
                  className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition focus:border-slate-400"
                  placeholder="姓名 / 邮箱"
                />
              </label>
              <label className="block space-y-2">
                <span className="text-xs uppercase tracking-[0.22em] text-slate-500">搜索</span>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition focus:border-slate-400"
                  placeholder="标题 / 创建人 / 邮箱"
                />
              </label>
              <label className="block space-y-2">
                <span className="text-xs uppercase tracking-[0.22em] text-slate-500">排序</span>
                <select
                  value={sortBy}
                  onChange={(event) => setSortBy(event.target.value)}
                  className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition focus:border-slate-400"
                >
                  <option value="updated_desc">更新时间 新到旧</option>
                  <option value="updated_asc">更新时间 旧到新</option>
                  <option value="title_asc">标题 A-Z</option>
                  <option value="title_desc">标题 Z-A</option>
                </select>
              </label>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <label className="block space-y-2">
              <span className="text-xs uppercase tracking-[0.22em] text-slate-500">创建开始日期</span>
              <input
                type="date"
                value={createdFrom}
                onChange={(event) => setCreatedFrom(event.target.value)}
                className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition focus:border-slate-400"
              />
            </label>
            <label className="block space-y-2">
              <span className="text-xs uppercase tracking-[0.22em] text-slate-500">创建结束日期</span>
              <input
                type="date"
                value={createdTo}
                onChange={(event) => setCreatedTo(event.target.value)}
                className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition focus:border-slate-400"
              />
            </label>
            <div className="hidden xl:block" />
            <div className="hidden xl:block" />
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-4">
            {[
              { label: "总数", value: stats.total, status: "" },
              { label: "草稿", value: stats.draft, status: "draft" },
              { label: "评审中", value: stats.review, status: "review" },
              { label: "已关闭", value: stats.closed, status: "closed" }
            ].map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => onChangeStatusFilter(item.status)}
                className={`rounded-2xl border px-4 py-4 text-left transition ${
                  statusFilter === item.status
                    ? "border-slate-900 bg-slate-900 text-white shadow-sm"
                    : "border-slate-200 bg-slate-50 hover:border-slate-300"
                }`}
              >
                <p className={`text-xs uppercase tracking-[0.22em] ${statusFilter === item.status ? "text-slate-300" : "text-slate-500"}`}>{item.label}</p>
                <p className={`mt-2 font-serif text-3xl tracking-tight ${statusFilter === item.status ? "text-white" : "text-slate-900"}`}>{item.value}</p>
              </button>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-end gap-2 text-xs text-slate-500">
            {(creatorFilter || createdFrom || createdTo || query || statusFilter) && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setCreatorFilter("");
                  setCreatedFrom("");
                  setCreatedTo("");
                  onChangeStatusFilter("");
                }}
                className="h-10 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
              >
                清空筛选
              </button>
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="hidden grid-cols-[1.4fr_0.8fr_0.8fr_0.8fr] gap-3 border-b border-slate-200 px-5 py-4 text-xs uppercase tracking-[0.24em] text-slate-500 md:grid">
            <span>标题</span>
            <span>状态</span>
            <span>步骤完成</span>
            <span>更新时间</span>
          </div>

          {visibleReports.filtered.length === 0 ? (
            <div className="px-5 py-10 text-sm text-slate-500">当前没有符合条件的 8D 报告。</div>
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
                <div className="text-sm"><StatusBadge status={report.status} /></div>
                <div className="text-sm text-slate-700">{countFilledSteps(report)}/8</div>
                <div className="text-sm text-slate-600">{formatDate(report.timestamps?.updatedAt)}</div>
              </button>
            ))
          )}
        </div>

        {visibleReports.filtered.length > 0 && (
          <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
            <span>
              第 {page} / {visibleReports.pageCount} 页，共 {visibleReports.filtered.length} 条
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 disabled:opacity-50"
              >
                上一页
              </button>
              <button
                type="button"
                disabled={page >= visibleReports.pageCount}
                onClick={() => setPage((prev) => Math.min(visibleReports.pageCount, prev + 1))}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 disabled:opacity-50"
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
