import { useState } from "react";
import { Field } from "./shared";

const initialLogin = {
  email: "",
  password: ""
};

const initialRegister = {
  name: "",
  email: "",
  password: "",
  role: "user",
  adminRegisterToken: ""
};

function Input(props) {
  return (
    <input
      {...props}
      className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400"
    />
  );
}

export default function AuthPage({ onLogin, onRegister }) {
  const [mode, setMode] = useState("login");
  const [loginForm, setLoginForm] = useState(initialLogin);
  const [registerForm, setRegisterForm] = useState(initialRegister);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");

    try {
      if (mode === "login") {
        await onLogin(loginForm);
      } else {
        await onRegister(registerForm);
      }
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-6xl gap-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[1.1fr_0.9fr] md:p-6">
        <section className="flex flex-col justify-between rounded-2xl bg-slate-900 px-6 py-7 text-slate-100 md:px-10 md:py-10">
          <div>
            <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">Notion-like 8D</p>
            <h1 className="mt-5 max-w-xl font-serif text-4xl leading-tight tracking-tight">
              面向企业问题闭环的 8D AI 工作台
            </h1>
            <p className="mt-5 max-w-xl text-sm leading-7 text-slate-300">
              登录后可查看 8D 列表、逐步编辑 D1-D8、调用 AI 生成高质量 8D，并维护企业内部模型配置。
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {[
              { title: "逐步编辑", text: "左侧步骤导航，右侧正文编辑，符合报告编写习惯。" },
              { title: "AI生成", text: "结合历史案例、风格总结和 5Why 输出结构化 8D。" },
              { title: "配置中心", text: "管理员可维护聊天模型与向量模型配置。" }
            ].map((item) => (
              <article key={item.title} className="rounded-lg border border-white/10 bg-white/5 p-4">
                <h2 className="font-medium text-white">{item.title}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-300">{item.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="flex items-center justify-center rounded-2xl bg-slate-50 px-4 py-6 md:px-8">
          <div className="w-full max-w-md">
            <div className="mb-6 flex rounded-full bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setMode("login")}
                className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition ${
                  mode === "login" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                }`}
              >
                登录
              </button>
              <button
                type="button"
                onClick={() => setMode("register")}
                className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition ${
                  mode === "register" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                }`}
              >
                注册
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div>
                <h2 className="font-serif text-2xl tracking-tight text-slate-900">
                  {mode === "login" ? "进入工作台" : "创建账号"}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  {mode === "login"
                    ? "使用已有账号登录后查看和编辑 8D 报告。"
                    : "注册后会自动登录；管理员注册需要额外口令。"}
                </p>
              </div>

              {mode === "register" && (
                <Field label="姓名">
                  <Input
                    value={registerForm.name}
                    onChange={(event) =>
                      setRegisterForm((prev) => ({ ...prev, name: event.target.value }))
                    }
                    placeholder="例如：Alice"
                    required
                  />
                </Field>
              )}

              <Field label="邮箱">
                <Input
                  type="email"
                  value={mode === "login" ? loginForm.email : registerForm.email}
                  onChange={(event) =>
                    mode === "login"
                      ? setLoginForm((prev) => ({ ...prev, email: event.target.value }))
                      : setRegisterForm((prev) => ({ ...prev, email: event.target.value }))
                  }
                  placeholder="name@company.com"
                  required
                />
              </Field>

              <Field label="密码">
                <Input
                  type="password"
                  value={mode === "login" ? loginForm.password : registerForm.password}
                  onChange={(event) =>
                    mode === "login"
                      ? setLoginForm((prev) => ({ ...prev, password: event.target.value }))
                      : setRegisterForm((prev) => ({ ...prev, password: event.target.value }))
                  }
                  placeholder="至少8位"
                  required
                />
              </Field>

              {mode === "register" && (
                <>
                  <Field label="角色" hint="管理员需要提供管理员注册口令。">
                    <select
                      value={registerForm.role}
                      onChange={(event) =>
                        setRegisterForm((prev) => ({ ...prev, role: event.target.value }))
                      }
                      className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                    >
                      <option value="user">普通用户</option>
                      <option value="admin">管理员</option>
                    </select>
                  </Field>

                  {registerForm.role === "admin" && (
                    <Field label="管理员口令">
                      <Input
                        value={registerForm.adminRegisterToken}
                        onChange={(event) =>
                          setRegisterForm((prev) => ({
                            ...prev,
                            adminRegisterToken: event.target.value
                          }))
                        }
                        placeholder="输入管理员口令"
                      />
                    </Field>
                  )}
                </>
              )}

              {message && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {message}
                </div>
              )}

              <button
                disabled={submitting}
                type="submit"
                className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "提交中..." : mode === "login" ? "登录" : "注册并进入"}
              </button>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}
