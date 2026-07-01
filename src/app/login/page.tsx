import { Suspense } from "react";
import LoginForm from "./LoginForm";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[360px] flex-col justify-center px-24 py-32 bg-midnight-charcoal">
      <Suspense
        fallback={
          <div className="text-caption text-dim-gray">Carregando…</div>
        }
      >
        <LoginForm />
      </Suspense>
    </main>
  );
}
