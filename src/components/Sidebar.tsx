"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [{ href: "/search", label: "Busca", icon: "◎" }];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-56 shrink-0 border-r border-light-gray px-16 py-24 md:flex md:flex-col bg-midnight-charcoal">
      <Link
        href="/search"
        className="mb-32 px-8 text-subheading font-semibold text-polar-white"
      >
        SearchGoogle
      </Link>
      <nav className="flex flex-col gap-8">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={
                "flex items-center gap-8 rounded-lg px-8 py-8 text-caption transition " +
                (active
                  ? "bg-dark-frost text-polar-white"
                  : "text-dim-gray hover:bg-off-black hover:text-polar-white")
              }
            >
              <span className={"text-base leading-none " + (active ? "text-data-blue" : "text-dim-gray")}>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
