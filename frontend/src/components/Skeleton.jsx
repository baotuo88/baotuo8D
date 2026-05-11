export default function Skeleton({ className = "" }) {
  return <div className={`animate-pulse rounded-lg bg-slate-200 ${className}`} />;
}

export function SkeletonText({ lines = 3, className = "" }) {
  return (
    <div className={`space-y-2.5 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className={`h-4 animate-pulse rounded bg-slate-200 ${
            i === lines - 1 ? "w-2/3" : "w-full"
          }`}
        />
      ))}
    </div>
  );
}

export function SkeletonCard({ rows = 4 }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="h-3 w-20 animate-pulse rounded bg-slate-200" />
      <div className="mt-3 h-6 w-48 animate-pulse rounded bg-slate-200" />
      <div className="mt-4 space-y-2.5">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className={`h-4 animate-pulse rounded bg-slate-200 ${
              i === rows - 1 ? "w-2/3" : "w-full"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 4 }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="grid gap-3 border-b border-slate-200 px-5 py-4">
        <div className="flex gap-3">
          {Array.from({ length: cols }).map((_, i) => (
            <div key={i} className="h-3 flex-1 animate-pulse rounded bg-slate-200" />
          ))}
        </div>
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="grid gap-3 border-b border-slate-100 px-5 py-4 last:border-b-0">
          <div className="flex gap-3">
            {Array.from({ length: cols }).map((_, j) => (
              <div
                key={j}
                className={`h-4 flex-1 animate-pulse rounded bg-slate-200 ${
                  j === 0 ? "max-w-[200px]" : "max-w-[100px]"
                }`}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
