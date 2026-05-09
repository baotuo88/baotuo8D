function NavItem({ active, label, href, onClick }) {
  return (
    <button
      type="button"
      onClick={() => onClick(href)}
      className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition ${
        active
          ? "bg-[#1f2937] text-white shadow-[0_10px_20px_rgba(31,41,55,0.22)]"
          : "text-stone-600 hover:bg-white hover:text-stone-900"
      }`}
    >
      <span>{label}</span>
      <span className={`text-xs ${active ? "text-slate-300" : "text-stone-400"}`}>›</span>
    </button>
  );
}

export default function AppShell({
  currentUser,
  route,
  navigation,
  onNavigate,
  onOpenGenerator,
  onLogout,
  errorMessage,
  children
}) {
  return (
    <div className="min-h-screen bg-[#eef2f7] text-stone-900">
      <div className="mx-auto flex min-h-screen w-full max-w-[1700px] flex-col lg:flex-row">
        <aside className="border-b border-slate-200 bg-[#f8fafc] px-5 py-6 lg:min-h-screen lg:w-[300px] lg:border-b-0 lg:border-r">
          <div className="space-y-5">
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">8D Workspace</p>
              <h1 className="mt-2 font-serif text-2xl tracking-tight text-slate-900">质量改进工作台</h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                面向制造质量闭环，统一管理 8D 报告、评审流转与 AI 生成。
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-slate-500">当前用户</p>
              <div className="mt-3">
                <p className="text-sm font-semibold text-slate-900">{currentUser.name}</p>
                <p className="mt-1 text-sm text-slate-600">{currentUser.email}</p>
                <span className="mt-3 inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">
                  {currentUser.role === "admin" ? "管理员" : "普通用户"}
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              {navigation.map((item) => (
                <NavItem
                  key={item.key}
                  active={route.page === item.key}
                  label={item.label}
                  href={item.href}
                  onClick={onNavigate}
                />
              ))}
            </div>

            <div className="space-y-2">
              <button
                type="button"
                onClick={onOpenGenerator}
                className="w-full rounded-2xl bg-[#0f766e] px-4 py-3 text-sm font-medium text-white transition hover:bg-[#0d5f59]"
              >
                AI 生成 8D
              </button>
              <button
                type="button"
                onClick={onLogout}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
              >
                退出登录
              </button>
            </div>
          </div>
        </aside>

        <main className="flex-1 px-4 py-4 md:px-7 md:py-7 lg:px-10">
          {errorMessage && (
            <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {errorMessage}
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
