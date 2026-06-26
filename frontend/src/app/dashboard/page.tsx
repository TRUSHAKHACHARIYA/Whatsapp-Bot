"use client";

import { useQuery } from "@tanstack/react-query";
import {
  MessageCircle, UserPlus, TrendingUp, Megaphone,
  ArrowUpRight, ArrowDownRight, Bot, Users
} from "lucide-react";
import { analyticsApi } from "@/services/api";
import { useAuthStore } from "@/store/auth.store";
import AppLayout from "@/components/layout/AppLayout";

interface StatCardProps {
  label: string;
  value: string | number;
  delta?: string;
  trend?: "up" | "down" | "neutral";
  icon: React.ReactNode;
}

function StatCard({ label, value, delta, trend, icon }: StatCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-gray-500">{label}</span>
        <span className="text-gray-400">{icon}</span>
      </div>
      <div className="text-2xl font-semibold text-gray-900">{value}</div>
      {delta && (
        <div className={`flex items-center gap-1 mt-1 text-xs ${
          trend === "up" ? "text-green-600" : trend === "down" ? "text-red-500" : "text-gray-400"
        }`}>
          {trend === "up" && <ArrowUpRight size={12} />}
          {trend === "down" && <ArrowDownRight size={12} />}
          {delta}
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuthStore();

  const { data: stats, isLoading } = useQuery({
    queryKey: ["analytics-dashboard"],
    queryFn: () => analyticsApi.dashboard(30).then((r) => r.data),
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <AppLayout>
        <div className="p-6 grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 p-5 animate-pulse h-28" />
          ))}
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
    <div className="p-6 space-y-6">
      {/* Greeting */}
      <div>
        <h1 className="text-lg font-semibold text-gray-900">
          Good morning, {user?.name?.split(" ")[0]} 👋
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Here's what's happening with {user?.tenant_name} today.
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Messages"
          value={stats?.messages?.total?.toLocaleString() || "—"}
          delta="+18% this month"
          trend="up"
          icon={<MessageCircle size={16} />}
        />
        <StatCard
          label="New Leads"
          value={stats?.leads?.new || "—"}
          delta="+24% this month"
          trend="up"
          icon={<UserPlus size={16} />}
        />
        <StatCard
          label="Conversion Rate"
          value={`${stats?.leads?.conversion_rate || 0}%`}
          delta="+4% vs last month"
          trend="up"
          icon={<TrendingUp size={16} />}
        />
        <StatCard
          label="Active Campaigns"
          value={stats?.campaigns?.active || 0}
          delta="2 scheduled · 1 live"
          trend="neutral"
          icon={<Megaphone size={16} />}
        />
      </div>

      {/* Two column: recent conversations + pipeline */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-gray-900">Recent Conversations</h2>
            <a href="/inbox" className="text-xs text-green-600 hover:underline">
              View all →
            </a>
          </div>
          <ConversationList />
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-gray-900">Automation Overview</h2>
          </div>
          <div className="space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Bot size={14} className="text-green-500" />
                <span className="text-xs text-gray-600">Bot Handled</span>
                <span className="ml-auto text-xs font-medium">
                  {stats?.conversations?.bot_handled || 0}
                </span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-400 rounded-full transition-all"
                  style={{ width: `${stats?.conversations?.automation_rate || 0}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Users size={14} className="text-blue-500" />
                <span className="text-xs text-gray-600">Agent Handled</span>
                <span className="ml-auto text-xs font-medium">
                  {stats?.conversations?.agent_handled || 0}
                </span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-400 rounded-full transition-all"
                  style={{
                    width: `${100 - (stats?.conversations?.automation_rate || 0)}%`,
                  }}
                />
              </div>
            </div>
            <div className="pt-2 border-t border-gray-100">
              <div className="text-2xl font-semibold text-gray-900">
                {stats?.conversations?.automation_rate || 0}%
              </div>
              <div className="text-xs text-gray-500">automation rate</div>
            </div>
          </div>
        </div>
      </div>
    </div>
    </AppLayout>
  );
}

function ConversationList() {
  const conversations = [
    { initials: "PK", name: "Priya Kapoor", preview: "Can I get a custom color?", time: "10:06", unread: 1, color: "bg-blue-100 text-blue-700" },
    { initials: "RV", name: "Ravi Verma", preview: "What's the price of Oslo sofa?", time: "9:48", unread: 0, color: "bg-green-100 text-green-700" },
    { initials: "AS", name: "Anita Shah", preview: "Is there parking at the showroom?", time: "9:30", unread: 2, color: "bg-amber-100 text-amber-700" },
    { initials: "MK", name: "Manish Kumar", preview: "I'd like to book an appointment", time: "9:11", unread: 0, color: "bg-pink-100 text-pink-700" },
  ];

  return (
    <div className="space-y-1">
      {conversations.map((c, i) => (
        <a
          key={i}
          href="/inbox"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 ${c.color}`}>
            {c.initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-gray-900">{c.name}</div>
            <div className="text-xs text-gray-400 truncate">{c.preview}</div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="text-xs text-gray-400">{c.time}</div>
            {c.unread > 0 && (
              <div className="w-4 h-4 bg-green-500 text-white text-[9px] rounded-full flex items-center justify-center ml-auto mt-0.5">
                {c.unread}
              </div>
            )}
          </div>
        </a>
      ))}
    </div>
  );
}
