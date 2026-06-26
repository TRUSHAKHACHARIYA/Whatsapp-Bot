"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, Plus, Trash2, GripVertical, Eye, ChevronRight } from "lucide-react";
import { apiClient } from "@/services/api";
import { Button, Modal, EmptyState, Card, Spinner } from "@/components/ui";
import { cn, formatRelative } from "@/lib/utils";
import { toast } from "sonner";
import AppLayout, { Topbar } from "@/components/layout/AppLayout";

const FIELD_TYPES = ["text", "email", "number", "dropdown", "checkbox", "radio", "date", "textarea"];

interface FormField {
  id: string;
  label: string;
  field_type: string;
  is_required: boolean;
  order: number;
  options: string[];
  placeholder?: string;
  maps_to?: string;
}

interface Form {
  id: string;
  name: string;
  description?: string;
  is_active: boolean;
  response_count: number;
  field_count: number;
  created_at: string;
  fields?: FormField[];
}

export default function FormsPage() {
  const qc = useQueryClient();
  const [selectedForm, setSelectedForm] = useState<Form | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [viewResponses, setViewResponses] = useState<string | null>(null);

  const { data: forms = [], isLoading } = useQuery({
    queryKey: ["forms"],
    queryFn: () => apiClient.get("/forms/").then((r) => r.data),
  });

  const { data: formDetail } = useQuery({
    queryKey: ["form-detail", selectedForm?.id],
    queryFn: () => apiClient.get(`/forms/${selectedForm!.id}`).then((r) => r.data),
    enabled: !!selectedForm,
  });

  const { data: responses = [] } = useQuery({
    queryKey: ["form-responses", viewResponses],
    queryFn: () => apiClient.get(`/forms/${viewResponses}/responses`).then((r) => r.data),
    enabled: !!viewResponses,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/forms/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["forms"] });
      setSelectedForm(null);
      toast.success("Form deleted.");
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      apiClient.patch(`/forms/${id}`, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["forms"] }),
  });

  const deleteFieldMutation = useMutation({
    mutationFn: ({ formId, fieldId }: { formId: string; fieldId: string }) =>
      apiClient.delete(`/forms/${formId}/fields/${fieldId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["form-detail", selectedForm?.id] });
      toast.success("Field removed.");
    },
  });

  return (
    <AppLayout>
      <Topbar
        title="Lead Forms"
        actions={
          <Button variant="primary" size="sm" icon={<Plus size={13} />} onClick={() => setCreateOpen(true)}>
            Create Form
          </Button>
        }
      />

      <div className="flex-1 overflow-hidden flex">
        {/* Forms list */}
        <div className="w-72 bg-white border-r border-gray-100 overflow-y-auto flex-shrink-0">
          <div className="p-3 border-b border-gray-100">
            <p className="text-xs text-gray-500">
              Forms are sent via the bot to collect lead information.
            </p>
          </div>
          {isLoading ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : forms.length === 0 ? (
            <EmptyState
              icon={<FileText size={28} />}
              title="No forms"
              description="Create your first lead form."
              action={<Button size="sm" variant="primary" onClick={() => setCreateOpen(true)}>Create Form</Button>}
            />
          ) : (
            forms.map((form: Form) => (
              <button
                key={form.id}
                onClick={() => setSelectedForm(form)}
                className={cn(
                  "w-full px-4 py-3 border-b border-gray-50 hover:bg-gray-50 text-left transition-colors",
                  selectedForm?.id === form.id && "bg-green-50"
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">{form.name}</div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {form.field_count} fields · {form.response_count} responses
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-2">
                    <span className={cn("w-1.5 h-1.5 rounded-full", form.is_active ? "bg-green-400" : "bg-gray-300")} />
                    <ChevronRight size={13} className="text-gray-400" />
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Form builder */}
        {selectedForm && formDetail ? (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-2xl">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">{formDetail.name}</h2>
                  {formDetail.description && (
                    <p className="text-sm text-gray-500 mt-0.5">{formDetail.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setViewResponses(formDetail.id)}
                    className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50"
                  >
                    <Eye size={13} />
                    {formDetail.response_count} responses
                  </button>
                  <button
                    onClick={() => toggleMutation.mutate({ id: formDetail.id, is_active: !formDetail.is_active })}
                    className={cn(
                      "relative w-10 h-5 rounded-full transition-colors",
                      formDetail.is_active ? "bg-green-400" : "bg-gray-200"
                    )}
                  >
                    <span className={cn(
                      "absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform",
                      formDetail.is_active ? "translate-x-5" : "translate-x-0.5"
                    )} />
                  </button>
                  <button
                    onClick={() => { deleteMutation.mutate(formDetail.id); }}
                    className="p-1.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {/* Fields */}
              <Card className="mb-4">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-900">Fields</span>
                  <AddFieldButton formId={formDetail.id} onAdded={() => qc.invalidateQueries({ queryKey: ["form-detail", selectedForm.id] })} />
                </div>
                {formDetail.fields?.length === 0 ? (
                  <div className="py-8 text-center">
                    <p className="text-sm text-gray-400">No fields yet. Add your first field.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {formDetail.fields?.map((field: FormField, idx: number) => (
                      <div key={field.id} className="px-4 py-3 flex items-center gap-3">
                        <GripVertical size={14} className="text-gray-300 cursor-grab flex-shrink-0" />
                        <div className="w-6 h-6 rounded bg-gray-100 text-gray-500 text-xs flex items-center justify-center font-medium flex-shrink-0">
                          {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-900">{field.label}</span>
                            {field.is_required && (
                              <span className="text-[10px] text-red-500">*required</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-mono capitalize">
                              {field.field_type}
                            </span>
                            {field.maps_to && (
                              <span className="text-[10px] text-gray-400">→ maps to {field.maps_to}</span>
                            )}
                            {field.options?.length > 0 && (
                              <span className="text-[10px] text-gray-400">
                                {field.options.length} options
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => deleteFieldMutation.mutate({ formId: formDetail.id, fieldId: field.id })}
                          className="p-1 rounded text-gray-300 hover:text-red-400 flex-shrink-0"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {/* Form preview */}
              <Card className="p-5">
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-4">Preview</div>
                <div className="space-y-4">
                  {formDetail.fields?.map((field: FormField) => (
                    <div key={field.id}>
                      <label className="block text-sm text-gray-700 mb-1">
                        {field.label}
                        {field.is_required && <span className="text-red-400 ml-1">*</span>}
                      </label>
                      {field.field_type === "textarea" ? (
                        <textarea disabled rows={3} placeholder={field.placeholder || ""} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 text-gray-400 resize-none" />
                      ) : field.field_type === "dropdown" ? (
                        <select disabled className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 text-gray-400">
                          <option>Select an option</option>
                          {field.options?.map((o) => <option key={o}>{o}</option>)}
                        </select>
                      ) : field.field_type === "checkbox" || field.field_type === "radio" ? (
                        <div className="space-y-1">
                          {field.options?.map((o) => (
                            <label key={o} className="flex items-center gap-2 text-sm text-gray-500">
                              <input type={field.field_type} disabled />
                              {o}
                            </label>
                          ))}
                        </div>
                      ) : (
                        <input
                          disabled
                          type={field.field_type}
                          placeholder={field.placeholder || ""}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 text-gray-400"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-gray-50">
            <EmptyState icon={<FileText size={40} />} title="Select a form" description="Choose a form from the list to edit its fields." />
          </div>
        )}
      </div>

      <CreateFormModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); qc.invalidateQueries({ queryKey: ["forms"] }); }} />

      {/* Responses modal */}
      {viewResponses && (
        <Modal open={!!viewResponses} onClose={() => setViewResponses(null)} title="Form Responses" width="max-w-2xl">
          <div className="max-h-96 overflow-y-auto space-y-3">
            {responses.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No responses yet.</p>
            ) : (
              responses.map((r: any) => (
                <div key={r.id} className="border border-gray-100 rounded-lg p-3">
                  <div className="text-xs text-gray-400 mb-2">{formatRelative(r.created_at)}</div>
                  <div className="space-y-1">
                    {Object.entries(r.answers).map(([k, v]) => (
                      <div key={k} className="flex gap-2 text-xs">
                        <span className="text-gray-400 min-w-24 truncate">{k}:</span>
                        <span className="text-gray-700 font-medium">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </Modal>
      )}
    </AppLayout>
  );
}

function AddFieldButton({ formId, onAdded }: { formId: string; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [field, setField] = useState({
    label: "",
    field_type: "text",
    is_required: true,
    placeholder: "",
    maps_to: "",
    options: "",
  });
  const [loading, setLoading] = useState(false);

  const handleAdd = async () => {
    if (!field.label.trim()) { toast.error("Field label is required."); return; }
    setLoading(true);
    try {
      await apiClient.post(`/forms/${formId}/fields`, {
        label: field.label,
        field_type: field.field_type,
        is_required: field.is_required,
        placeholder: field.placeholder || null,
        maps_to: field.maps_to || null,
        options: ["dropdown", "radio", "checkbox"].includes(field.field_type)
          ? field.options.split(",").map((o) => o.trim()).filter(Boolean)
          : [],
        order: 99,
      });
      toast.success("Field added.");
      setOpen(false);
      setField({ label: "", field_type: "text", is_required: true, placeholder: "", maps_to: "", options: "" });
      onAdded();
    } catch { toast.error("Failed to add field."); }
    finally { setLoading(false); }
  };

  return (
    <>
      <Button size="sm" icon={<Plus size={12} />} onClick={() => setOpen(true)}>Add Field</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Add Field" width="max-w-md">
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Label</label>
            <input value={field.label} onChange={(e) => setField({ ...field, label: e.target.value })}
              placeholder="e.g. Full Name" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Type</label>
              <select value={field.field_type} onChange={(e) => setField({ ...field, field_type: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none">
                {FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Maps to</label>
              <select value={field.maps_to} onChange={(e) => setField({ ...field, maps_to: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none">
                <option value="">None</option>
                {["name", "email", "phone", "city"].map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
          {["dropdown", "radio", "checkbox"].includes(field.field_type) && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Options (comma separated)</label>
              <input value={field.options} onChange={(e) => setField({ ...field, options: e.target.value })}
                placeholder="Option 1, Option 2, Option 3" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20" />
            </div>
          )}
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={field.is_required} onChange={(e) => setField({ ...field, is_required: e.target.checked })} />
            Required field
          </label>
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <Button size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" variant="primary" loading={loading} onClick={handleAdd}>Add Field</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

function CreateFormModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) { toast.error("Form name is required."); return; }
    setLoading(true);
    try {
      await apiClient.post("/forms/", { name, description: description || null });
      toast.success("Form created.");
      setName(""); setDescription("");
      onCreated();
    } catch { toast.error("Failed to create form."); }
    finally { setLoading(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Create Form">
      <div className="space-y-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Form Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sofa Inquiry Form"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Description (optional)</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="What is this form for?"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20 resize-none" />
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
          <Button size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" variant="primary" loading={loading} onClick={handleCreate}>Create</Button>
        </div>
      </div>
    </Modal>
  );
}
