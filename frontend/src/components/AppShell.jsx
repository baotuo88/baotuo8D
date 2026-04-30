function NavItem({ active, label, href, onClick }) {
  return (
    <button
      type="button"
      onClick={() => onClick(href)}
      className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition ${
        active
          ? "bg-white text-stone-900 shadow-[0_1px_0_rgba(15,23,42,0.08)]"
          : "text-stone-500 hover:bg-white/70 hover:text-stone-900"
      }`}
    >
      <span>{label}</span>
      <span className="text-xs text-stone-400">›</span>
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
    <div className="min-h-screen bg-[#f7f6f3] text-stone-900">
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col lg:flex-row">
        <aside className="border-b border-stone-200/80 bg-[#fbfaf8] px-5 py-6 lg:min-h-screen lg:w-[280px] lg:border-b-0 lg:border-r">
          <div className="space-y-5">
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-stone-400">8D Workspace</p>
              <h1 className="mt-2 font-serif text-2xl tracking-tight text-stone-900">质量改进台账</h1>
              <p className="mt-2 text-sm leading-6 text-stone-500">
                左侧导航，右侧编辑。风格接近 Notion，但保留企业工程文档的密度感。
              </p>
            </div>

            <div className="rounded-2xl border border-stone-200 bg-white p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-stone-400">当前用户</p>
              <div className="mt-3">
                <p className="text-sm font-medium text-stone-900">{currentUser.name}</p>
                <p className="mt-1 text-sm text-stone-500">{currentUser.email}</p>
                <span className="mt-3 inline-flex rounded-full bg-stone-100 px-2.5 py-1 text-xs text-stone-600">
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
                className="w-full rounded-2xl bg-stone-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-stone-800"
              >
                AI 生成 8D
              </button>
              <button
                type="button"
                onClick={onLogout}
                className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm font-medium text-stone-600 transition hover:border-stone-300 hover:text-stone-900"
              >
                退出登录
              </button>
            </div>
          </div>
        </aside>

        <main className="flex-1 px-4 py-4 md:px-6 md:py-6 lg:px-8">
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
