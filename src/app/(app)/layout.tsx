import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { SignOutButton } from "@/components/SignOutButton";
import { Sidebar } from "@/components/Sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <div className="flex min-h-screen bg-midnight-charcoal">
      <Sidebar />
      <div className="flex-1 min-w-0">
        <header className="flex items-center justify-end border-b border-light-gray px-24 py-16">
          <div className="flex items-center gap-24 text-caption text-dim-gray">
            <span>{session.user?.email}</span>
            <SignOutButton />
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-24 py-24">{children}</main>
      </div>
    </div>
  );
}
