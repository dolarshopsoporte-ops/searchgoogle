"use client";

import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Spinner } from "@/components/Icons";

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") ?? "/search";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
      callbackUrl
    });
    setBusy(false);
    if (res?.ok) {
      router.push(callbackUrl);
      router.refresh();
    } else {
      setErr("Credenciais inválidas");
    }
  }

  return (
    <form onSubmit={onSubmit} className="w-full space-y-40">
      <div>
        <h1 className="text-heading-lg text-polar-white">
          Search<span className="text-dim-gray">Google</span>
        </h1>
        <p className="mt-16 text-caption text-dim-gray">Acesso do operador.</p>
      </div>
      <div className="space-y-24">
        <label className="block">
          <span className="font-mono text-[12px] uppercase tracking-[0.071em] text-dim-gray">
            Email
          </span>
          <input
            className="field mt-8"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
        </label>
        <label className="block">
          <span className="font-mono text-[12px] uppercase tracking-[0.071em] text-dim-gray">
            Senha
          </span>
          <input
            className="field mt-8"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
      </div>
      {err ? (
        <p className="text-caption text-red-300/90 -mt-24">{err}</p>
      ) : null}
      <button
        type="submit"
        className="btn btn-primary w-full"
        disabled={busy}
      >
        {busy ? (
          <>
            <Spinner /> Entrando…
          </>
        ) : (
          "Entrar"
        )}
      </button>
    </form>
  );
}
