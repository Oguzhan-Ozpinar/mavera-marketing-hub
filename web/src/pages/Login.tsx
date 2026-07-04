import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/auth";
import { api } from "../lib/api";

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [derneks, setDerneks] = useState<Array<{ id: string; name: string }>>([]);
  const [dernek, setDernek] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ derneks: Array<{ id: string; name: string }> }>("/derneks")
      .then((r) => {
        setDerneks(r.derneks);
        if (r.derneks[0]) setDernek(r.derneks[0].id);
      })
      .catch(() => {});
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      await login(dernek, email, password);
      nav("/");
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100">
      <form onSubmit={submit} className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold">M</div>
          <div>
            <h1 className="text-lg font-semibold leading-tight">Mavera Marketing Hub</h1>
            <p className="text-xs text-slate-500">Yönetim paneli</p>
          </div>
        </div>

        <label className="block text-sm font-medium mb-1">Dernek</label>
        <select
          value={dernek}
          onChange={(e) => setDernek(e.target.value)}
          className="w-full mb-4 px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
        >
          {derneks.length === 0 && <option value="">yükleniyor…</option>}
          {derneks.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>

        <label className="block text-sm font-medium mb-1">E-posta</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full mb-4 px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none"
          required
        />

        <label className="block text-sm font-medium mb-1">Şifre</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full mb-4 px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none"
          required
        />

        {err && <p className="text-sm text-red-600 mb-3">{err}</p>}

        <button
          disabled={busy}
          className="w-full py-2.5 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 active:bg-indigo-800 transition-colors disabled:opacity-60"
        >
          {busy ? "Giriş yapılıyor…" : "Giriş yap"}
        </button>
      </form>
    </div>
  );
}
