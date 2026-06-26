"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect } from "react";
import {
  LayoutDashboard, MessageSquare, Users, Megaphone, Bot,
  HelpCircle, FileText, BarChart2, CreditCard, Settings,
  MessageCircle, Bell, LogOut, FileCode,
} from "lucide-react";
import { cn, getInitials, avatarColor } from "@/lib/utils";
import { useAuthStore } from "@/store/auth.store";

const NAV = [
  {
    section: "Main",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { label: "Inbox", href: "/inbox", icon: MessageSquare },
      { label: "Leads", href: "/leads", icon: Users },
      { label: "Campaigns", href: "/campaigns", icon: Megaphone },
    ],
  },
  {
    section: "Automation",
    items: [
      { label: "Bot Builder", href: "/bot", icon: Bot },
      { label: "FAQ Engine", href: "/faq", icon: HelpCircle },
      { label: "Lead Forms", href: "/forms", icon: FileText },
      { label: "Templates", href: "/templates", icon: FileCode },
    ],
  },
  {
    section: "Workspace",
    items: [
      { label: "Analytics", href: "/analytics", icon: BarChart2 },
      { label: "Billing", href: "/billing", icon: CreditCard },
      { label: "Settings", href: "/settings", icon: Settings },
    ],
  },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isAuthenticated, logout } = useAuthStore();

  useEffect(() => {
    if (!isAuthenticated) router.push("/login");
  }, [isAuthenticated, router]);

  if (!isAuthenticated || !user) return null;

  const { bg, text } = avatarColor(user.name);

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <aside className="w-56 bg-white border-r border-gray-100 flex flex-col flex-shrink-0">
        <div className="flex items-center gap-2.5 px-4 py-4 border-b border-gray-100">
          <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center flex-shrink-0">
            <MessageCircle size={16} className="text-white" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-900 truncate">WapiSend</div>
            <div className="text-[10px] text-gray-400 truncate">{user.tenant_name}</div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-2">
          {NAV.map((group) => (
            <div key={group.section} className="mb-4">
              <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider px-3 mb-1">
                {group.section}
              </div>
              {group.items.map((item) => {
                const active = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors",
                      active
                        ? "bg-green-50 text-green-700 font-medium"
                        : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                    )}
                  >
                    <item.icon size={15} className={active ? "text-green-600" : "text-gray-400"} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="border-t border-gray-100 p-3">
          <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-gray-50 cursor-pointer group">
            <div className={cn("w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0", bg, text)}>
              {getInitials(user.name)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-gray-900 truncate">{user.name}</div>
              <div className="text-[10px] text-gray-400 capitalize">{user.role}</div>
            </div>
            <button
              onClick={() => { logout(); router.push("/login"); }}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-red-500"
              title="Sign out"
            >
              <LogOut size={13} />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {children}
      </div>
    </div>
  );
}

export function Topbar({ title, actions }: { title: string; actions?: React.ReactNode }) {
  return (
    <div className="bg-white border-b border-gray-100 flex items-center px-6 gap-4 flex-shrink-0" style={{ minHeight: 52 }}>
      <h1 className="text-sm font-semibold text-gray-900 flex-1">{title}</h1>
      <div className="flex items-center gap-2">
        <button className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors">
          <Bell size={16} />
        </button>
        {actions}
      </div>
    </div>
  );
}
