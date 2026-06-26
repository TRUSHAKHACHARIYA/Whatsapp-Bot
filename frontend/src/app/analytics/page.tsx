"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend,
} from "recharts";
import { analyticsApi } from "@/services/api";
import { Avatar, Card, Spinner } from "@/components/ui";
import { cn } from "@/lib/utils";
import AppLayout, { Topbar } from "@/components/layout/AppLayout";

const COLORS = ["#25D366", "#378ADD", "#EF9F27", "#D85A30", "#888780"];

export default function AnalyticsPage() {
  const [days, setDays] = useState(30);

  const { data: stats, isLoading } = useQuery({
    queryKey: ["analytics-dashboard", days],
    queryFn: () => analyticsApi.dashboard(days).then((r) => r.data),
  });

  const { data: agentStats = [] } = useQuery({
    queryKey: ["agent-performance", days],
    queryFn: () => analyticsApi.agentPerformance(days).then((r) => r.data),
  });

  const { data: faqStats = [] } = useQuery({
    queryKey: ["faq-performance"],
    queryFn: () => analyticsApi.faqPerformance().then((r) => r.data),
  });

  // Mock time-series data (replace with real endpoint in V2)
  const messageTimeSeries = Array.from({ length: 7 }, (_, i) => ({
    day: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i],
    inbound: Math.floor(Math.random() * 300) + 100,
    outbound: Math.floor(Math.random() * 400) + 150,
  }));

  const convPieData = [
    { name: "Bot Handled", value: stats?.conversations?.bot_handled || 0 },
    { name: "Agent Handled", value: stats?.conversations?.agent_handled || 0 },
  ];

  const leadPieData = [
    { name: "New", value: 84 },
    { name: "Qualified", value: 61 },
    { name: "Contacted", value: 47 },
    { name: "Won", value: 96 },
    { name: "Lost", value: 22 },
  ];

  return (
    <AppLayout>
      <Topbar
        title="Analytics"
        actions={
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={cn(
                  "px-3 py-1 text-xs rounded-md font-medium transition-colors",
                  days === d ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                )}
              >
                {d}d
              </button>
            ))}
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* KPI row */}
        {isLoading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-4">
              {[
                { label: "Total Messages", value: stats?.messages?.total?.toLocaleString(), sub: `${stats?.messages?.inbound?.toLocaleString()} inbound` },
                { label: "Bot Automation Rate", value: `${stats?.conversations?.automation_rate ?? 0}%`, sub: `${stats?.conversations?.bot_handled} handled by bot` },
                { label: "New Leads", value: stats?.leads?.new, sub: `${stats?.leads?.won} won this period` },
                { label: "Conversion Rate", value: `${stats?.leads?.conversion_rate ?? 0}%`, sub: "Won ÷ Total leads" },
              ].map(({ label, value, sub }) => (
                <Card key={label} className="p-5">
                  <div className="text-xs text-gray-500 mb-1">{label}</div>
                  <div className="text-2xl font-semibold text-gray-900">{value ?? "—"}</div>
                  <div className="text-xs text-gray-400 mt-1">{sub}</div>
                </Card>
              ))}
            </div>

            {/* Charts row 1 */}
            <div className="grid grid-cols-3 gap-4">
              <Card className="col-span-2 p-5">
                <div className="text-sm font-medium text-gray-900 mb-4">Message Volume (Last 7 Days)</div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={messageTimeSeries} barSize={16}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #f3f4f6" }}
                    />
                    <Bar dataKey="inbound" fill="#25D366" radius={[3, 3, 0, 0]} name="Inbound" />
                    <Bar dataKey="outbound" fill="#9FE1CB" radius={[3, 3, 0, 0]} name="Outbound" />
                    <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>

              <Card className="p-5">
                <div className="text-sm font-medium text-gray-900 mb-4">Bot vs Agent</div>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={convPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={80}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {convPieData.map((_, i) => (
                        <Cell key={i} fill={COLORS[i]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </Card>
            </div>

            {/* Charts row 2 */}
            <div className="grid grid-cols-3 gap-4">
              <Card className="p-5">
                <div className="text-sm font-medium text-gray-900 mb-4">Lead Pipeline</div>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={leadPieData} cx="50%" cy="50%" outerRadius={80} paddingAngle={2} dataKey="value">
                      {leadPipelineColors.map((color, i) => (
                        <Cell key={i} fill={color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </Card>

              <Card className="col-span-2 p-5">
                <div className="text-sm font-medium text-gray-900 mb-4">Agent Performance</div>
                {agentStats.length === 0 ? (
                  <p className="text-sm text-gray-400">No agent data yet.</p>
                ) : (
                  <div className="space-y-3">
                    {agentStats.map((agent: { agent_id: string; name: string; conversations: number }) => {
                      const maxConv = Math.max(...agentStats.map((a: any) => a.conversations));
                      return (
                        <div key={agent.agent_id} className="flex items-center gap-3">
                          <Avatar name={agent.name} size="sm" />
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between text-sm mb-1">
                              <span className="font-medium text-gray-900 truncate">{agent.name}</span>
                              <span className="text-gray-500 flex-shrink-0 ml-2">{agent.conversations} chats</span>
                            </div>
                            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-green-400 rounded-full transition-all"
                                style={{ width: `${(agent.conversations / maxConv) * 100}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            </div>

            {/* FAQ Performance */}
            {faqStats.length > 0 && (
              <Card className="p-5">
                <div className="text-sm font-medium text-gray-900 mb-4">Top FAQ Hits</div>
                <div className="space-y-3">
                  {faqStats.slice(0, 8).map((faq: { id: string; question: string; category: string; hits: number }, i: number) => {
                    const maxHits = faqStats[0]?.hits || 1;
                    return (
                      <div key={faq.id} className="flex items-center gap-3">
                        <span className="text-xs text-gray-400 w-4 text-right flex-shrink-0">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm text-gray-700 truncate">{faq.question}</span>
                            {faq.category && (
                              <span className="text-[10px] bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded-full flex-shrink-0">
                                {faq.category}
                              </span>
                            )}
                          </div>
                          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-400 rounded-full"
                              style={{ width: `${(faq.hits / maxHits) * 100}%` }}
                            />
                          </div>
                        </div>
                        <span className="text-sm font-medium text-gray-600 flex-shrink-0">{faq.hits}</span>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}

const leadPipelineColors = ["#378ADD", "#25D366", "#EF9F27", "#639922", "#E24B4A"];
