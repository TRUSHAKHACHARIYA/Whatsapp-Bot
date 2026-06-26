"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FileCode, Plus, Trash2, CheckCircle, Clock, XCircle, RefreshCw } from "lucide-react";
import { apiClient } from "@/services/api";
import { Button, Modal, EmptyState, Card, Spinner } from "@/components/ui";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import AppLayout, { Topbar } from "@/components/layout/AppLayout";

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  APPROVED: { label: "Approved", color: "bg-green-50 text-green-700", icon: <CheckCircle size={12} /> },
  PENDING: { label: "Pending", color: "bg-amber-50 text-amber-700", icon: <Clock size={12} /> },
  REJECTED: { label: "Rejected", color: "bg-red-50 text-red-600", icon: <XCircle size={12} /> },
  IN_APPEAL: { label: "In Appeal", color: "bg-blue-50 text-blue-700", icon: <Clock size={12} /> },
};

const CATEGORY_COLORS: Record<string, string> = {
  MARKETING: "bg-purple-50 text-purple-700",
  UTILITY: "bg-blue-50 text-blue-700",
  AUTHENTICATION: "bg-amber-50 text-amber-700",
};

interface Template {
  id: string;
  name: string;
  status: string;
  language: string;
  category: string;
  components: Array<{ type: string; text?: string; format?: string }>;
}

export default function TemplatesPage() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("ALL");

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["templates"],
    queryFn: () => apiClient.get("/templates/").then((r) => r.data),
  });

  const deleteMutation = useMutation({
    mutationFn: (name: string) => apiClient.delete(`/templates/${name}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["templates"] });
      toast.success("Template deleted.");
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || "Failed to delete template."),
  });

  const templates: Template[] = data?.templates || [];
  const filtered = filterStatus === "ALL" ? templates : templates.filter((t) => t.status === filterStatus);

  const getBodyText = (t: Template) => {
    const body = t.components?.find((c) => c.type === "BODY");
    return body?.text?.slice(0, 120) || "";
  };

  const getHeaderText = (t: Template) => {
    const header = t.components?.find((c) => c.type === "HEADER");
    return header?.text || header?.format || "";
  };

  return (
    <AppLayout>
      <Topbar
        title="Message Templates"
        actions={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              icon={<RefreshCw size={13} className={isRefetching ? "animate-spin" : ""} />}
              onClick={() => refetch()}
            >
              Sync from Meta
            </Button>
            <Button variant="primary" size="sm" icon={<Plus size={13} />} onClick={() => setCreateOpen(true)}>
              Create Template
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-6">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          {[
            { label: "Total", value: templates.length, color: "" },
            { label: "Approved", value: templates.filter((t) => t.status === "APPROVED").length, color: "text-green-600" },
            { label: "Pending", value: templates.filter((t) => t.status === "PENDING").length, color: "text-amber-600" },
            { label: "Rejected", value: templates.filter((t) => t.status === "REJECTED").length, color: "text-red-500" },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="text-xs text-gray-500 mb-1">{label}</div>
              <div className={cn("text-2xl font-semibold", color || "text-gray-900")}>{value}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex gap-1 mb-4 border-b border-gray-100">
          {["ALL", "APPROVED", "PENDING", "REJECTED"].map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={cn(
                "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors capitalize",
                filterStatus === s
                  ? "text-green-700 border-green-500"
                  : "text-gray-500 border-transparent hover:text-gray-700"
              )}
            >
              {s.charAt(0) + s.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        {/* Template grid */}
        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<FileCode size={36} />}
            title="No templates found"
            description="Create a WhatsApp message template. Templates must be approved by Meta before use in campaigns."
            action={
              <Button variant="primary" size="sm" icon={<Plus size={13} />} onClick={() => setCreateOpen(true)}>
                Create Template
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((template) => {
              const statusCfg = STATUS_CONFIG[template.status] || STATUS_CONFIG.PENDING;
              return (
                <Card key={template.id} className="p-4 flex flex-col">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-gray-900 font-mono truncate">
                        {template.name}
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className={cn("inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium", statusCfg.color)}>
                          {statusCfg.icon}
                          {statusCfg.label}
                        </span>
                        <span className={cn("text-[11px] px-2 py-0.5 rounded-full font-medium", CATEGORY_COLORS[template.category] || "bg-gray-100 text-gray-600")}>
                          {template.category}
                        </span>
                        <span className="text-[11px] text-gray-400 uppercase">{template.language}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        if (window.confirm(`Delete template "${template.name}"?`)) {
                          deleteMutation.mutate(template.name);
                        }
                      }}
                      className="p-1.5 text-gray-300 hover:text-red-400 transition-colors ml-2 flex-shrink-0"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>

                  {/* Template preview */}
                  <div className="flex-1 bg-gray-50 rounded-lg p-3 text-xs text-gray-600 space-y-1">
                    {getHeaderText(template) && (
                      <div className="font-semibold text-gray-800 border-b border-gray-200 pb-1 mb-1">
                        {getHeaderText(template)}
                      </div>
                    )}
                    <p className="leading-relaxed whitespace-pre-wrap">
                      {getBodyText(template) || "No body text"}
                    </p>
                    {template.components?.find((c) => c.type === "FOOTER") && (
                      <div className="text-gray-400 text-[10px] pt-1 border-t border-gray-200 mt-1">
                        {template.components.find((c) => c.type === "FOOTER")?.text}
                      </div>
                    )}
                    {template.components?.find((c) => c.type === "BUTTONS") && (
                      <div className="pt-1 border-t border-gray-200 mt-1 flex flex-wrap gap-1">
                        {(template.components.find((c) => c.type === "BUTTONS") as any)?.buttons?.map(
                          (b: any, i: number) => (
                            <span key={i} className="text-[10px] bg-white border border-blue-200 text-blue-600 px-2 py-0.5 rounded">
                              {b.text}
                            </span>
                          )
                        )}
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <CreateTemplateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          qc.invalidateQueries({ queryKey: ["templates"] });
        }}
      />
    </AppLayout>
  );
}

function CreateTemplateModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    name: "",
    language: "en",
    category: "MARKETING",
    header_text: "",
    body: "",
    footer: "",
  });
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!form.name.trim() || !form.body.trim()) {
      toast.error("Template name and body are required.");
      return;
    }
    if (!/^[a-z0-9_]+$/.test(form.name)) {
      toast.error("Template name must be lowercase letters, numbers and underscores only.");
      return;
    }
    setLoading(true);
    try {
      const payload: any = {
        name: form.name,
        language: form.language,
        category: form.category,
        body: form.body,
      };
      if (form.header_text) {
        payload.header = { type: "TEXT", text: form.header_text };
      }
      if (form.footer) {
        payload.footer = form.footer;
      }
      await apiClient.post("/templates/", payload);
      toast.success("Template submitted for Meta review. It will be approved within 24 hours.");
      onCreated();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to create template.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Create Template" width="max-w-lg">
      <div className="space-y-4">
        <div className="bg-blue-50 text-blue-700 text-xs rounded-lg p-3">
          Templates must be approved by Meta before use. Approval typically takes a few hours to 24 hours.
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Template Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })}
              placeholder="e.g. summer_sale_v1"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400 font-mono"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Category</label>
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none"
            >
              <option value="MARKETING">Marketing</option>
              <option value="UTILITY">Utility</option>
              <option value="AUTHENTICATION">Authentication</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Language</label>
          <select
            value={form.language}
            onChange={(e) => setForm({ ...form, language: e.target.value })}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none"
          >
            {[
              { value: "en", label: "English" },
              { value: "en_US", label: "English (US)" },
              { value: "hi", label: "Hindi" },
              { value: "mr", label: "Marathi" },
              { value: "gu", label: "Gujarati" },
              { value: "ta", label: "Tamil" },
              { value: "te", label: "Telugu" },
              { value: "kn", label: "Kannada" },
            ].map((l) => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Header Text (optional)</label>
          <input
            value={form.header_text}
            onChange={(e) => setForm({ ...form, header_text: e.target.value })}
            placeholder="Bold header shown above body"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Body *</label>
          <textarea
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
            rows={4}
            placeholder={"Hello {{1}},\n\nWe have an exclusive offer for you! 🎉\n\nUse code {{2}} for 20% off your next purchase.\n\nValid until {{3}}."}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20 resize-none"
          />
          <p className="text-xs text-gray-400 mt-1">Use {"{{1}}"}, {"{{2}}"} etc. for dynamic variables.</p>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Footer (optional)</label>
          <input
            value={form.footer}
            onChange={(e) => setForm({ ...form, footer: e.target.value })}
            placeholder="Reply STOP to unsubscribe"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
          <Button size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" variant="primary" loading={loading} onClick={handleCreate}>
            Submit for Approval
          </Button>
        </div>
      </div>
    </Modal>
  );
}
