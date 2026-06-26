"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Megaphone, Plus, Send, Trash2, BarChart2, Clock, CheckCircle, PauseCircle } from "lucide-react";
import { campaignsApi } from "@/services/api";
import { Button, Modal, EmptyState, Card, Spinner, Badge } from "@/components/ui";
import { cn, STATUS_STYLES, formatRelative } from "@/lib/utils";
import { toast } from "sonner";
import AppLayout, { Topbar } from "@/components/layout/AppLayout";

const STATUS_ICONS: Record<string, React.ReactNode> = {
  draft: <PauseCircle size={13} className="text-gray-400" />,
  scheduled: <Clock size={13} className="text-amber-500" />,
  running: <Send size={13} className="text-green-500" />,
  completed: <CheckCircle size={13} className="text-blue-500" />,
  paused: <PauseCircle size={13} className="text-red-400" />,
};

interface Campaign {
  id: string;
  name: string;
  template_name: string;
  status: string;
  audience_count: number;
  sent_count: number;
  delivered_count: number;
  read_count: number;
  failed_count: number;
  scheduled_at?: string;
  created_at: string;
}

export default function CampaignsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ["campaigns", tab],
    queryFn: () => campaignsApi.list(tab === "all" ? undefined : tab).then((r) => r.data),
    refetchInterval: 15000,
  });

  const sendMutation = useMutation({
    mutationFn: (id: string) => campaignsApi.send(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      toast.success("Campaign broadcast started!");
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || "Failed to start campaign."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => campaignsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      setSelectedCampaign(null);
      toast.success("Campaign deleted.");
    },
  });

  const readRate = (c: Campaign) =>
    c.sent_count > 0 ? Math.round((c.read_count / c.sent_count) * 100) : 0;

  const deliveryRate = (c: Campaign) =>
    c.sent_count > 0 ? Math.round((c.delivered_count / c.sent_count) * 100) : 0;

  return (
    <AppLayout>
      <Topbar
        title="Campaigns"
        actions={
          <Button variant="primary" size="sm" icon={<Plus size={13} />} onClick={() => setCreateOpen(true)}>
            New Campaign
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto p-6">
        {/* Summary stats */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          {[
            { label: "Total Campaigns", value: campaigns.length },
            { label: "Messages Sent", value: campaigns.reduce((a: number, c: Campaign) => a + c.sent_count, 0).toLocaleString() },
            { label: "Avg Read Rate", value: campaigns.length ? `${Math.round(campaigns.reduce((a: number, c: Campaign) => a + readRate(c), 0) / campaigns.length)}%` : "—" },
            { label: "Active Now", value: campaigns.filter((c: Campaign) => c.status === "running").length },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="text-xs text-gray-500 mb-1">{label}</div>
              <div className="text-2xl font-semibold text-gray-900">{value}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 border-b border-gray-100">
          {["all", "running", "scheduled", "draft", "completed"].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
                tab === t ? "text-green-700 border-green-500" : "text-gray-500 border-transparent hover:text-gray-700"
              )}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* Table */}
        <Card>
          {isLoading ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : campaigns.length === 0 ? (
            <EmptyState
              icon={<Megaphone size={36} />}
              title="No campaigns yet"
              description="Create a broadcast campaign to send WhatsApp messages to your audience."
              action={<Button variant="primary" size="sm" icon={<Plus size={13} />} onClick={() => setCreateOpen(true)}>New Campaign</Button>}
            />
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  {["Campaign", "Template", "Audience", "Sent", "Delivered", "Read Rate", "Status", "Date", ""].map((h) => (
                    <th key={h} className="text-left text-xs text-gray-400 font-medium px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c: Campaign) => (
                  <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setSelectedCampaign(c)}
                        className="text-sm font-medium text-gray-900 hover:text-green-700 text-left"
                      >
                        {c.name}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 font-mono">{c.template_name}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{c.audience_count || "—"}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{c.sent_count || "—"}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {c.delivered_count > 0 ? `${deliveryRate(c)}%` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {c.sent_count > 0 ? (
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-green-400 rounded-full" style={{ width: `${readRate(c)}%` }} />
                          </div>
                          <span className="text-xs text-gray-600">{readRate(c)}%</span>
                        </div>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {STATUS_ICONS[c.status]}
                        <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full capitalize", STATUS_STYLES[c.status])}>
                          {c.status}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">
                      {c.scheduled_at ? `Sched. ${formatRelative(c.scheduled_at)}` : formatRelative(c.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {(c.status === "draft" || c.status === "scheduled") && (
                          <Button
                            size="sm"
                            variant="primary"
                            icon={<Send size={11} />}
                            loading={sendMutation.isPending}
                            onClick={() => sendMutation.mutate(c.id)}
                          >
                            Send
                          </Button>
                        )}
                        {c.status === "draft" && (
                          <button
                            onClick={() => deleteMutation.mutate(c.id)}
                            className="p-1.5 rounded text-gray-400 hover:text-red-500 transition-colors"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <CreateCampaignModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => { setCreateOpen(false); qc.invalidateQueries({ queryKey: ["campaigns"] }); }}
      />

      {selectedCampaign && (
        <CampaignDetailModal
          campaign={selectedCampaign}
          open={!!selectedCampaign}
          onClose={() => setSelectedCampaign(null)}
          onSend={() => { sendMutation.mutate(selectedCampaign.id); setSelectedCampaign(null); }}
          onDelete={() => deleteMutation.mutate(selectedCampaign.id)}
        />
      )}
    </AppLayout>
  );
}

function CreateCampaignModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    name: "",
    template_name: "",
    template_language: "en",
    audience_filter: {},
    scheduled_at: "",
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.template_name.trim()) {
      toast.error("Name and template are required.");
      return;
    }
    setLoading(true);
    try {
      await campaignsApi.create({
        name: form.name,
        template_name: form.template_name,
        audience_filter: form.audience_filter,
        scheduled_at: form.scheduled_at || undefined,
      });
      toast.success("Campaign created.");
      onCreated();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to create campaign.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="New Campaign" width="max-w-lg">
      <div className="space-y-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Campaign Name</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Summer Sale 2025"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">WhatsApp Template Name</label>
          <input
            value={form.template_name}
            onChange={(e) => setForm({ ...form, template_name: e.target.value })}
            placeholder="e.g. promo_summer_v2"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400"
          />
          <p className="text-xs text-gray-400 mt-1">Must match an approved template in your Meta Business Manager.</p>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Template Language</label>
          <select
            value={form.template_language}
            onChange={(e) => setForm({ ...form, template_language: e.target.value })}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400"
          >
            <option value="en">English</option>
            <option value="hi">Hindi</option>
            <option value="mr">Marathi</option>
            <option value="gu">Gujarati</option>
            <option value="ta">Tamil</option>
            <option value="te">Telugu</option>
          </select>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Schedule (optional)</label>
          <input
            type="datetime-local"
            value={form.scheduled_at}
            onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400"
          />
          <p className="text-xs text-gray-400 mt-1">Leave empty to save as draft.</p>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
          <Button size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" variant="primary" loading={loading} onClick={handleSubmit}>
            Create Campaign
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function CampaignDetailModal({
  campaign, open, onClose, onSend, onDelete,
}: {
  campaign: Campaign;
  open: boolean;
  onClose: () => void;
  onSend: () => void;
  onDelete: () => void;
}) {
  const readRate = campaign.sent_count > 0 ? Math.round((campaign.read_count / campaign.sent_count) * 100) : 0;

  return (
    <Modal open={open} onClose={onClose} title={campaign.name} width="max-w-lg">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          {STATUS_ICONS[campaign.status]}
          <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full capitalize", STATUS_STYLES[campaign.status])}>
            {campaign.status}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Template", value: campaign.template_name },
            { label: "Audience", value: campaign.audience_count || "All contacts" },
            { label: "Sent", value: campaign.sent_count || "—" },
            { label: "Delivered", value: campaign.delivered_count || "—" },
            { label: "Read", value: campaign.read_count ? `${campaign.read_count} (${readRate}%)` : "—" },
            { label: "Failed", value: campaign.failed_count || "—" },
          ].map(({ label, value }) => (
            <div key={label} className="bg-gray-50 rounded-lg p-3">
              <div className="text-xs text-gray-400 mb-0.5">{label}</div>
              <div className="text-sm font-medium text-gray-900">{String(value)}</div>
            </div>
          ))}
        </div>

        {campaign.sent_count > 0 && (
          <div>
            <div className="text-xs text-gray-500 mb-2">Read Rate</div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-green-400 rounded-full transition-all" style={{ width: `${readRate}%` }} />
            </div>
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>0%</span>
              <span className="text-green-600 font-medium">{readRate}%</span>
              <span>100%</span>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-3 border-t border-gray-100">
          {campaign.status === "draft" && (
            <button onClick={onDelete} className="text-xs text-red-500 hover:text-red-600">Delete</button>
          )}
          <div className="flex gap-2 ml-auto">
            <Button size="sm" onClick={onClose}>Close</Button>
            {(campaign.status === "draft" || campaign.status === "scheduled") && (
              <Button size="sm" variant="primary" icon={<Send size={13} />} onClick={onSend}>
                Send Now
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
