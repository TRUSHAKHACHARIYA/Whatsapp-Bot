"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { HelpCircle, Plus, Search, Edit2, Trash2, Tag, TrendingUp } from "lucide-react";
import { apiClient } from "@/services/api";
import { Button, Modal, EmptyState, Card, Spinner } from "@/components/ui";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import AppLayout, { Topbar } from "@/components/layout/AppLayout";

interface FAQ {
  id: string;
  question: string;
  answer: string;
  keywords: string[];
  category: string;
  hit_count: number;
  is_active: boolean;
  created_at: string;
}

const fetchFAQs = (search: string, category: string) =>
  apiClient.get("/faqs/", { params: { search: search || undefined, category: category || undefined } }).then((r) => r.data);

const fetchCategories = () =>
  apiClient.get("/faqs/categories").then((r) => r.data);

export default function FAQPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [editFAQ, setEditFAQ] = useState<FAQ | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const { data: faqs = [], isLoading } = useQuery({
    queryKey: ["faqs", search, category],
    queryFn: () => fetchFAQs(search, category),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["faq-categories"],
    queryFn: fetchCategories,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/faqs/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["faqs"] });
      toast.success("FAQ deleted.");
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      apiClient.patch(`/faqs/${id}`, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["faqs"] }),
  });

  const topFAQs = [...faqs].sort((a: FAQ, b: FAQ) => b.hit_count - a.hit_count).slice(0, 3);

  return (
    <AppLayout>
      <Topbar
        title="FAQ Engine"
        actions={
          <Button variant="primary" size="sm" icon={<Plus size={13} />} onClick={() => setCreateOpen(true)}>
            Add FAQ
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto p-6">
        {/* Top stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="text-xs text-gray-500 mb-1">Total FAQs</div>
            <div className="text-2xl font-semibold">{faqs.length}</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="text-xs text-gray-500 mb-1">Active</div>
            <div className="text-2xl font-semibold text-green-600">
              {faqs.filter((f: FAQ) => f.is_active).length}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="text-xs text-gray-500 mb-1">Total Hits</div>
            <div className="text-2xl font-semibold">
              {faqs.reduce((a: number, f: FAQ) => a + f.hit_count, 0).toLocaleString()}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-6">
          {/* Main FAQ list */}
          <div className="col-span-2 space-y-4">
            {/* Filters */}
            <div className="flex gap-3">
              <div className="flex-1 relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search FAQs…"
                  className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400 bg-white"
                />
              </div>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20 bg-white"
              >
                <option value="">All categories</option>
                {categories.map((c: { category: string; count: number }) => (
                  <option key={c.category} value={c.category}>{c.category} ({c.count})</option>
                ))}
              </select>
            </div>

            <Card>
              {isLoading ? (
                <div className="flex justify-center py-12"><Spinner /></div>
              ) : faqs.length === 0 ? (
                <EmptyState
                  icon={<HelpCircle size={36} />}
                  title="No FAQs yet"
                  description="Add FAQs so the bot can automatically answer common questions."
                  action={<Button variant="primary" size="sm" icon={<Plus size={13} />} onClick={() => setCreateOpen(true)}>Add FAQ</Button>}
                />
              ) : (
                <div className="divide-y divide-gray-50">
                  {faqs.map((faq: FAQ) => (
                    <div key={faq.id} className="px-4 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1", faq.is_active ? "bg-green-400" : "bg-gray-300")} />
                            <p className="text-sm font-medium text-gray-900">{faq.question}</p>
                          </div>
                          <p className="text-xs text-gray-500 leading-relaxed mb-2 ml-3.5">{faq.answer}</p>
                          <div className="flex items-center gap-2 ml-3.5 flex-wrap">
                            {faq.category && (
                              <span className="text-[10px] bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full font-medium">
                                {faq.category}
                              </span>
                            )}
                            {faq.keywords.slice(0, 5).map((kw) => (
                              <span key={kw} className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full flex items-center gap-1">
                                <Tag size={8} />{kw}
                              </span>
                            ))}
                            {faq.keywords.length > 5 && (
                              <span className="text-[10px] text-gray-400">+{faq.keywords.length - 5} more</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <div className="text-right mr-2">
                            <div className="text-sm font-semibold text-gray-700">{faq.hit_count}</div>
                            <div className="text-[10px] text-gray-400">hits</div>
                          </div>
                          <button
                            onClick={() => toggleMutation.mutate({ id: faq.id, is_active: !faq.is_active })}
                            className={cn(
                              "relative w-8 h-4 rounded-full transition-colors",
                              faq.is_active ? "bg-green-400" : "bg-gray-200"
                            )}
                          >
                            <span className={cn(
                              "absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform",
                              faq.is_active ? "translate-x-4" : "translate-x-0.5"
                            )} />
                          </button>
                          <button
                            onClick={() => setEditFAQ(faq)}
                            className="p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-50"
                          >
                            <Edit2 size={12} />
                          </button>
                          <button
                            onClick={() => deleteMutation.mutate(faq.id)}
                            className="p-1.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Sidebar: top FAQs + categories */}
          <div className="space-y-4">
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp size={14} className="text-green-500" />
                <span className="text-sm font-medium text-gray-900">Top FAQs</span>
              </div>
              {topFAQs.length === 0 ? (
                <p className="text-xs text-gray-400">No FAQs yet</p>
              ) : (
                <div className="space-y-3">
                  {topFAQs.map((faq: FAQ, i: number) => (
                    <div key={faq.id} className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded bg-gray-100 text-gray-500 text-xs flex items-center justify-center font-medium flex-shrink-0">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-gray-700 truncate">{faq.question}</div>
                        <div className="h-1 bg-gray-100 rounded-full mt-1 overflow-hidden">
                          <div
                            className="h-full bg-green-400 rounded-full"
                            style={{ width: `${topFAQs[0].hit_count > 0 ? (faq.hit_count / topFAQs[0].hit_count) * 100 : 0}%` }}
                          />
                        </div>
                      </div>
                      <span className="text-xs font-medium text-gray-600 flex-shrink-0">{faq.hit_count}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="p-4">
              <div className="text-sm font-medium text-gray-900 mb-3">Categories</div>
              {categories.length === 0 ? (
                <p className="text-xs text-gray-400">No categories yet</p>
              ) : (
                <div className="space-y-2">
                  {categories.map((c: { category: string; count: number }) => (
                    <button
                      key={c.category}
                      onClick={() => setCategory(category === c.category ? "" : c.category)}
                      className={cn(
                        "w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors",
                        category === c.category ? "bg-green-50 text-green-700" : "hover:bg-gray-50 text-gray-700"
                      )}
                    >
                      <span>{c.category}</span>
                      <span className="font-medium">{c.count}</span>
                    </button>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>

      <FAQModal
        faq={createOpen ? null : editFAQ}
        open={createOpen || !!editFAQ}
        onClose={() => { setCreateOpen(false); setEditFAQ(null); }}
        onSaved={() => { setCreateOpen(false); setEditFAQ(null); qc.invalidateQueries({ queryKey: ["faqs"] }); qc.invalidateQueries({ queryKey: ["faq-categories"] }); }}
      />
    </AppLayout>
  );
}

function FAQModal({
  faq, open, onClose, onSaved,
}: {
  faq: FAQ | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    question: faq?.question || "",
    answer: faq?.answer || "",
    keywords: faq?.keywords?.join(", ") || "",
    category: faq?.category || "",
  });
  const [loading, setLoading] = useState(false);

  // Sync form when faq changes
  useState(() => {
    setForm({
      question: faq?.question || "",
      answer: faq?.answer || "",
      keywords: faq?.keywords?.join(", ") || "",
      category: faq?.category || "",
    });
  });

  const handleSave = async () => {
    if (!form.question.trim() || !form.answer.trim()) {
      toast.error("Question and answer are required.");
      return;
    }
    setLoading(true);
    const payload = {
      question: form.question,
      answer: form.answer,
      keywords: form.keywords.split(",").map((k) => k.trim()).filter(Boolean),
      category: form.category || null,
    };
    try {
      if (faq) {
        await apiClient.patch(`/faqs/${faq.id}`, payload);
        toast.success("FAQ updated.");
      } else {
        await apiClient.post("/faqs/", payload);
        toast.success("FAQ created.");
      }
      onSaved();
    } catch {
      toast.error("Failed to save FAQ.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={faq ? "Edit FAQ" : "Add FAQ"} width="max-w-lg">
      <div className="space-y-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Question</label>
          <input
            value={form.question}
            onChange={(e) => setForm({ ...form, question: e.target.value })}
            placeholder="e.g. What are your store timings?"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Answer</label>
          <textarea
            value={form.answer}
            onChange={(e) => setForm({ ...form, answer: e.target.value })}
            rows={4}
            placeholder="We are open Monday–Saturday, 10am–8pm."
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400 resize-none"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Keywords (comma separated)</label>
          <input
            value={form.keywords}
            onChange={(e) => setForm({ ...form, keywords: e.target.value })}
            placeholder="timing, hours, open, close"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400"
          />
          <p className="text-xs text-gray-400 mt-1">Bot matches incoming messages against these keywords.</p>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Category (optional)</label>
          <input
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            placeholder="General, Pricing, Product, Support…"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400"
          />
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
          <Button size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" variant="primary" loading={loading} onClick={handleSave}>
            {faq ? "Save Changes" : "Add FAQ"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
