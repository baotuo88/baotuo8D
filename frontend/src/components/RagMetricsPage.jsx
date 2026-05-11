import { SkeletonCard, SkeletonTable } from "./Skeleton";

function StatCard({ title, value, hint = "" }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{title}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

function toPercent(v) {
  return `${(Number(v || 0) * 100).toFixed(1)}%`;
}

function toNumber(v) {
  return Number(v || 0).toLocaleString();
}

export default function RagMetricsPage({ loading, data, onRefresh, onExportCsv }) {
  const generation = data?.generation || {};
  const evaluation = data?.evaluation || {};
  const trends = Array.isArray(data?.trends) ? data.trends : [];

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">RAG 指标看板</h2>
          <p className="text-sm text-slate-500">生成效率、评分与趋势总览</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onRefresh}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            刷新
          </button>
          <button
            type="button"
            onClick={onExportCsv}
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800"
          >
            导出趋势 CSV
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonCard key={i} rows={1} />
            ))}
          </div>
          <SkeletonTable rows={5} cols={4} />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <StatCard title="生成总数" value={toNumber(generation.total)} />
            <StatCard title="成功数" value={toNumber(generation.success)} />
            <StatCard title="失败数" value={toNumber(generation.failed)} />
            <StatCard title="P95时延(ms)" value={toNumber(generation.p95_duration_ms)} />
            <StatCard title="平均时延(ms)" value={toNumber(generation.avg_duration_ms)} />
            <StatCard title="评分总数" value={toNumber(evaluation.total)} />
            <StatCard title="满意度" value={toPercent(evaluation.satisfaction_rate)} />
            <StatCard
              title="评分分布"
              value={`好 ${toNumber(evaluation.good)} / 一般 ${toNumber(evaluation.normal)} / 差 ${toNumber(
                evaluation.bad
              )}`}
            />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-medium text-slate-800">近 14 天趋势</h3>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="px-2 py-2">日期</th>
                    <th className="px-2 py-2">生成总数</th>
                    <th className="px-2 py-2">成功数</th>
                    <th className="px-2 py-2">平均时延(ms)</th>
                  </tr>
                </thead>
                <tbody>
                  {trends.map((row) => (
                    <tr key={String(row.day)} className="border-b border-slate-100">
                      <td className="px-2 py-2 text-slate-700">{String(row.day).slice(0, 10)}</td>
                      <td className="px-2 py-2 text-slate-900">{toNumber(row.total)}</td>
                      <td className="px-2 py-2 text-slate-900">{toNumber(row.success)}</td>
                      <td className="px-2 py-2 text-slate-900">{toNumber(row.avg_duration_ms)}</td>
                    </tr>
                  ))}
                  {trends.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-2 py-4 text-center text-slate-500">
                        暂无数据
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
