"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UserPlus, Search, Filter, MoreHorizontal, Users } from "lucide-react";
import { apiClient, leadsApi } from "@/services/api";
import { Avatar, Badge, Button, Modal, EmptyState, Card, Spinner } from "@/components/ui";
import { cn, STAGE_STYLES, formatRelative } from "@/lib/utils";
import { toast } from "sonner";
import AppLayout, { Topbar } from "@/components/layout/AppLayout";

const STAGES = ["new", "qualified", "contacted", "won", "lost"];
const STAGE_LABELS: Record<string, string> = {
  new: "New", qualified: "Qualified", contacted: "Contacted", won: "Won", lost: "Lost",
};

interface Lead {
  id: string;
  stage: string;
  source: string;
  notes: string;
  value: number;
  created_at: string;
  contact: { id: string; name: string; phone: string; email: string };
  assigned_agent?: { id: string; name: string };
}

export default function LeadsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [editModal, setEditModal] = useState(false);

  const { data: stats } = useQuery({
    queryKey: ["lead-stats"],
    queryFn: () => leadsApi.stats().then((r) => r.data),
  });

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["leads", stageFilter, search],
    queryFn: () => leadsApi.list({ stage: stageFilter || undefined, search: search || undefined }).then((r) => r.data),
    refetchInterval: 30000,
  });

  const updateStageMutation = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: string }) => leadsApi.update(id, { stage }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["lead-stats"] });
      toast.success("Stage updated.");
    },
    onError: () => toast.error("Failed to update stage."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => leadsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["lead-stats"] });
      setSelectedLead(null);
      toast.success("Lead deleted.");
    },
  });

  return (
    <AppLayout>
      <Topbar
        title="Leads"
        actions={
          <Button variant="primary" size="sm" icon={<UserPlus size={13} />}>
            Add Lead
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto p-6">
        {/* Stats */}
        <div className="grid grid-cols-5 gap-3 mb-6">
          {STAGES.map((s) => (
            <button
              key={s}
              onClick={() => setStageFilter(stageFilter === s ? null : s)}
              className={cn(
                "bg-white rounded-xl border p-4 text-left transition-all",
                stageFilter === s ? "border-green-400 ring-1 ring-green-400" : "border-gray-100 hover:border-gray-200"
              )}
            >
              <div className="text-xs text-gray-500 mb-1">{STAGE_LABELS[s]}</div>
              <div className="text-2xl font-semibold text-gray-900">
                {stats?.by_stage?.[s] ?? "—"}
              </div>
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 relative max-w-sm">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or phone…"
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400 bg-white"
            />
          </div>
          {stageFilter && (
            <button onClick={() => setStageFilter(null)} className="text-xs text-gray-500 hover:text-gray-700 underline">
              Clear filter
            </button>
          )}
          <div className="ml-auto text-xs text-gray-400">{leads.length} leads</div>
        </div>

        {/* Table */}
        <Card>
          {isLoading ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : leads.length === 0 ? (
            <EmptyState
              icon={<Users size={36} />}
              title="No leads found"
              description="Leads are created automatically when contacts submit forms or you add them manually."
              action={<Button variant="primary" size="sm" icon={<UserPlus size={13} />}>Add Lead</Button>}
            />
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  {["Contact", "Phone", "Source", "Stage", "Value", "Added", ""].map((h) => (
                    <th key={h} className="text-left text-xs text-gray-400 font-medium px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {leads.map((lead: Lead) => (
                  <tr
                    key={lead.id}
                    className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => { setSelectedLead(lead); setEditModal(true); }}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={lead.contact.name || lead.contact.phone} size="sm" />
                        <div>
                          <div className="text-sm font-medium text-gray-900">{lead.contact.name || "—"}</div>
                          <div className="text-xs text-gray-400">{lead.contact.email || ""}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{lead.contact.phone}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full capitalize">
                        {lead.source?.replace("_", " ") || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={lead.stage}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => updateStageMutation.mutate({ id: lead.id, stage: e.target.value })}
                        className={cn("text-xs font-medium px-2 py-1 rounded-full border-none outline-none cursor-pointer", STAGE_STYLES[lead.stage])}
                      >
                        {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {lead.value ? `₹${lead.value.toLocaleString()}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">
                      {formatRelative(lead.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={(e) => { e.stopPropagation(); setSelectedLead(lead); setEditModal(true); }}
                        className="text-gray-400 hover:text-gray-600 p-1 rounded"
                      >
                        <MoreHorizontal size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      {/* Lead detail modal */}
      {selectedLead && (
        <LeadDetailModal
          lead={selectedLead}
          open={editModal}
          onClose={() => { setEditModal(false); setSelectedLead(null); }}
          onStageChange={(stage) => updateStageMutation.mutate({ id: selectedLead.id, stage })}
          onDelete={() => deleteMutation.mutate(selectedLead.id)}
          onSaveNotes={(notes, value) =>
            leadsApi.update(selectedLead.id, { notes, value }).then(() => {
              qc.invalidateQueries({ queryKey: ["leads"] });
              toast.success("Lead updated.");
            })
          }
        />
      )}
    </AppLayout>
  );
}

function LeadDetailModal({
  lead, open, onClose, onStageChange, onDelete, onSaveNotes,
}: {
  lead: Lead;
  open: boolean;
  onClose: () => void;
  onStageChange: (s: string) => void;
  onDelete: () => void;
  onSaveNotes: (notes: string, value: number) => void;
}) {
  const [notes, setNotes] = useState(lead.notes || "");
  const [value, setValue] = useState(lead.value?.toString() || "");

  return (
    <Modal open={open} onClose={onClose} title="Lead Details" width="max-w-xl">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Avatar name={lead.contact.name || lead.contact.phone} size="lg" />
          <div>
            <div className="text-base font-semibold text-gray-900">{lead.contact.name}</div>
            <div className="text-sm text-gray-500">{lead.contact.phone}</div>
          </div>
          <div className="ml-auto">
            <select
              value={lead.stage}
              onChange={(e) => onStageChange(e.target.value)}
              className={cn("text-xs font-medium px-3 py-1.5 rounded-full border-none outline-none cursor-pointer", STAGE_STYLES[lead.stage])}
            >
              {["new", "qualified", "contacted", "won", "lost"].map((s) => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-xs text-gray-400 mb-1">Email</div>
            <div className="text-gray-700">{lead.contact.email || "—"}</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-xs text-gray-400 mb-1">Source</div>
            <div className="text-gray-700 capitalize">{lead.source?.replace("_", " ") || "—"}</div>
          </div>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Deal Value (₹)</label>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            type="number"
            placeholder="e.g. 25000"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Add notes about this lead…"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400 resize-none"
          />
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
          <button onClick={onDelete} className="text-xs text-red-500 hover:text-red-600">Delete lead</button>
          <div className="flex gap-2">
            <Button size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" variant="primary" onClick={() => { onSaveNotes(notes, parseFloat(value) || 0); onClose(); }}>
              Save Changes
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
