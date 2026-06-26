"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bot, Plus, Play, Square, Trash2, Save, MessageSquare,
  List, HelpCircle, FileText, Headset, AlertCircle, FlaskConical
} from "lucide-react";
import { apiClient } from "@/services/api";
import { Button, Modal, EmptyState, Card, Spinner } from "@/components/ui";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import AppLayout, { Topbar } from "@/components/layout/AppLayout";

const NODE_TYPES = [
  { type: "welcome", label: "Welcome Message", icon: MessageSquare, color: "text-green-600", bg: "bg-green-50", desc: "First message when user starts" },
  { type: "menu", label: "Menu Node", icon: List, color: "text-blue-600", bg: "bg-blue-50", desc: "Show numbered options" },
  { type: "text", label: "Text Message", icon: MessageSquare, color: "text-gray-600", bg: "bg-gray-100", desc: "Send a plain text reply" },
  { type: "faq", label: "FAQ Match", icon: HelpCircle, color: "text-purple-600", bg: "bg-purple-50", desc: "Match keywords to FAQ" },
  { type: "collect_info", label: "Collect Info", icon: FileText, color: "text-amber-600", bg: "bg-amber-50", desc: "Trigger a lead form" },
  { type: "agent_handoff", label: "Agent Handoff", icon: Headset, color: "text-red-600", bg: "bg-red-50", desc: "Escalate to human agent" },
  { type: "fallback", label: "Fallback", icon: AlertCircle, color: "text-gray-500", bg: "bg-gray-100", desc: "Default unmatched reply" },
];

interface FlowNode {
  id: string;
  type: string;
  data: Record<string, any>;
  position?: { x: number; y: number };
}

interface BotFlow {
  id: string;
  name: string;
  is_active: boolean;
  node_count: number;
  updated_at: string;
}

export default function BotPage() {
  const qc = useQueryClient();
  const [selectedFlow, setSelectedFlow] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [newFlowName, setNewFlowName] = useState("");

  const { data: flows = [], isLoading } = useQuery({
    queryKey: ["bot-flows"],
    queryFn: () => apiClient.get("/bot/flows").then((r) => r.data),
  });

  const { data: flowDetail } = useQuery({
    queryKey: ["bot-flow", selectedFlow],
    queryFn: () => apiClient.get(`/bot/flows/${selectedFlow}`).then((r) => r.data),
    enabled: !!selectedFlow,
  });

  const createMutation = useMutation({
    mutationFn: (name: string) => apiClient.post("/bot/flows", { name }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["bot-flows"] });
      setSelectedFlow(res.data.id);
      setCreateOpen(false);
      setNewFlowName("");
      toast.success("Flow created.");
    },
  });

  const activateMutation = useMutation({
    mutationFn: (id: string) => apiClient.post(`/bot/flows/${id}/activate`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bot-flows"] });
      toast.success("Flow activated! Bot is now live.");
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || "Cannot activate empty flow."),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => apiClient.post(`/bot/flows/${id}/deactivate`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bot-flows"] });
      toast.success("Flow deactivated.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/bot/flows/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bot-flows"] });
      setSelectedFlow(null);
      toast.success("Flow deleted.");
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || "Deactivate the flow first."),
  });

  const activeFlow = flows.find((f: BotFlow) => f.is_active);

  return (
    <AppLayout>
      <Topbar
        title="Bot Builder"
        actions={
          <div className="flex items-center gap-2">
            {selectedFlow && flowDetail && (
              <>
                <Button
                  size="sm"
                  icon={<FlaskConical size={13} />}
                  onClick={() => setTestOpen(true)}
                >
                  Test Flow
                </Button>
                {flowDetail.is_active ? (
                  <Button
                    size="sm"
                    icon={<Square size={13} />}
                    onClick={() => deactivateMutation.mutate(selectedFlow)}
                    loading={deactivateMutation.isPending}
                  >
                    Deactivate
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="primary"
                    icon={<Play size={13} />}
                    onClick={() => activateMutation.mutate(selectedFlow)}
                    loading={activateMutation.isPending}
                  >
                    Activate
                  </Button>
                )}
              </>
            )}
            <Button variant="primary" size="sm" icon={<Plus size={13} />} onClick={() => setCreateOpen(true)}>
              New Flow
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-hidden flex">
        {/* Flow list sidebar */}
        <div className="w-64 bg-white border-r border-gray-100 flex flex-col flex-shrink-0">
          <div className="p-3 border-b border-gray-100">
            {activeFlow ? (
              <div className="flex items-center gap-2 bg-green-50 rounded-lg px-3 py-2">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <div className="min-w-0">
                  <div className="text-xs font-medium text-green-700 truncate">{activeFlow.name}</div>
                  <div className="text-[10px] text-green-600">Bot is live</div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                <div className="w-2 h-2 rounded-full bg-gray-400" />
                <div className="text-xs text-gray-500">No active flow</div>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {isLoading ? (
              <div className="flex justify-center py-6"><Spinner /></div>
            ) : flows.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-xs text-gray-400">No flows yet.</p>
                <button onClick={() => setCreateOpen(true)} className="text-xs text-green-600 mt-1 hover:underline">
                  Create your first flow
                </button>
              </div>
            ) : (
              flows.map((flow: BotFlow) => (
                <button
                  key={flow.id}
                  onClick={() => setSelectedFlow(flow.id)}
                  className={cn(
                    "w-full text-left px-3 py-2.5 rounded-lg mb-1 transition-colors",
                    selectedFlow === flow.id ? "bg-green-50" : "hover:bg-gray-50"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900 truncate">{flow.name}</span>
                    {flow.is_active && (
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0 ml-1" />
                    )}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">{flow.node_count} nodes</div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Flow editor */}
        {selectedFlow && flowDetail ? (
          <FlowEditor
            flow={flowDetail}
            onSaved={() => qc.invalidateQueries({ queryKey: ["bot-flow", selectedFlow] })}
            onDelete={() => {
              if (window.confirm("Delete this flow?")) deleteMutation.mutate(selectedFlow);
            }}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center bg-gray-50">
            <EmptyState
              icon={<Bot size={40} />}
              title="Select or create a flow"
              description="Build menu-based bot flows that automatically handle customer conversations."
              action={
                <Button variant="primary" size="sm" icon={<Plus size={13} />} onClick={() => setCreateOpen(true)}>
                  New Flow
                </Button>
              }
            />
          </div>
        )}
      </div>

      {/* Create modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New Bot Flow">
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Flow Name</label>
            <input
              value={newFlowName}
              onChange={(e) => setNewFlowName(e.target.value)}
              placeholder="e.g. Acme Furniture Bot"
              onKeyDown={(e) => e.key === "Enter" && newFlowName && createMutation.mutate(newFlowName)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <Button size="sm" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              size="sm"
              variant="primary"
              loading={createMutation.isPending}
              onClick={() => newFlowName && createMutation.mutate(newFlowName)}
            >
              Create
            </Button>
          </div>
        </div>
      </Modal>

      {/* Test modal */}
      {selectedFlow && testOpen && (
        <TestFlowModal flowId={selectedFlow} open={testOpen} onClose={() => setTestOpen(false)} />
      )}
    </AppLayout>
  );
}

// ─── Flow Editor ──────────────────────────────────────────────────────────────

function FlowEditor({
  flow,
  onSaved,
  onDelete,
}: {
  flow: any;
  onSaved: () => void;
  onDelete: () => void;
}) {
  const [nodes, setNodes] = useState<FlowNode[]>(flow.flow_data?.nodes || []);
  const [saving, setSaving] = useState(false);
  const [addNodeType, setAddNodeType] = useState<string | null>(null);
  const [nodeForm, setNodeForm] = useState<Record<string, any>>({});

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiClient.post(`/bot/flows/${flow.id}/save`, {
        nodes: nodes.map((n, i) => ({ ...n, position: { x: 300, y: i * 140 } })),
        edges: buildEdges(nodes),
      });
      toast.success("Flow saved.");
      onSaved();
    } catch {
      toast.error("Failed to save flow.");
    } finally {
      setSaving(false);
    }
  };

  const handleAddNode = () => {
    if (!addNodeType) return;
    const newNode: FlowNode = {
      id: `node_${Date.now()}`,
      type: addNodeType,
      data: buildNodeData(addNodeType, nodeForm),
    };
    setNodes([...nodes, newNode]);
    setAddNodeType(null);
    setNodeForm({});
  };

  const removeNode = (id: string) => setNodes(nodes.filter((n) => n.id !== id));

  const moveNode = (id: string, dir: "up" | "down") => {
    const idx = nodes.findIndex((n) => n.id === id);
    if (dir === "up" && idx > 0) {
      const n = [...nodes];
      [n[idx - 1], n[idx]] = [n[idx], n[idx - 1]];
      setNodes(n);
    } else if (dir === "down" && idx < nodes.length - 1) {
      const n = [...nodes];
      [n[idx], n[idx + 1]] = [n[idx + 1], n[idx]];
      setNodes(n);
    }
  };

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Node palette */}
      <div className="w-56 bg-white border-r border-gray-100 overflow-y-auto flex-shrink-0 p-3">
        <div className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3 px-1">Add Node</div>
        {NODE_TYPES.map((nt) => (
          <button
            key={nt.type}
            onClick={() => { setAddNodeType(nt.type); setNodeForm({}); }}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors mb-1 text-left"
          >
            <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0", nt.bg)}>
              <nt.icon size={14} className={nt.color} />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-medium text-gray-800">{nt.label}</div>
              <div className="text-[10px] text-gray-400 truncate">{nt.desc}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Canvas */}
      <div className="flex-1 overflow-y-auto bg-gray-50 p-6">
        <div className="max-w-xl mx-auto space-y-1">
          {/* Toolbar */}
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-medium text-gray-700">
              {flow.name}
              {flow.is_active && (
                <span className="ml-2 text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full">Active</span>
              )}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="danger" icon={<Trash2 size={12} />} onClick={onDelete}>Delete</Button>
              <Button size="sm" variant="primary" icon={<Save size={12} />} loading={saving} onClick={handleSave}>Save Flow</Button>
            </div>
          </div>

          {/* Start marker */}
          <div className="flex justify-center mb-2">
            <div className="text-xs bg-green-500 text-white px-3 py-1 rounded-full font-medium">
              ▶ START
            </div>
          </div>

          {/* Nodes */}
          {nodes.length === 0 ? (
            <div className="text-center py-16 text-sm text-gray-400">
              Click a node type on the left to add it to the flow.
            </div>
          ) : (
            nodes.map((node, idx) => {
              const nt = NODE_TYPES.find((t) => t.type === node.type);
              return (
                <div key={node.id}>
                  <NodeCard
                    node={node}
                    nt={nt}
                    idx={idx}
                    total={nodes.length}
                    onMoveUp={() => moveNode(node.id, "up")}
                    onMoveDown={() => moveNode(node.id, "down")}
                    onRemove={() => removeNode(node.id)}
                    onUpdate={(data) => setNodes(nodes.map((n) => n.id === node.id ? { ...n, data } : n))}
                  />
                  {idx < nodes.length - 1 && (
                    <div className="flex justify-center py-1">
                      <div className="w-0.5 h-5 bg-gray-200" />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Add node modal */}
      {addNodeType && (
        <AddNodeModal
          type={addNodeType}
          form={nodeForm}
          setForm={setNodeForm}
          onAdd={handleAddNode}
          onClose={() => setAddNodeType(null)}
        />
      )}
    </div>
  );
}

// ─── Node Card ────────────────────────────────────────────────────────────────

function NodeCard({
  node, nt, idx, total, onMoveUp, onMoveDown, onRemove, onUpdate,
}: {
  node: FlowNode;
  nt: any;
  idx: number;
  total: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  onUpdate: (data: any) => void;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <div className={cn("bg-white rounded-xl border shadow-sm overflow-hidden", nt?.type === "welcome" ? "border-green-300" : "border-gray-200")}>
      <div className="flex items-center gap-3 px-4 py-3">
        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0", nt?.bg || "bg-gray-100")}>
          {nt && <nt.icon size={15} className={nt.color} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-900">{nt?.label || node.type}</div>
          <div className="text-xs text-gray-400 truncate">
            {nodePreview(node)}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {idx > 0 && (
            <button onClick={onMoveUp} className="p-1 text-gray-300 hover:text-gray-600 text-xs">↑</button>
          )}
          {idx < total - 1 && (
            <button onClick={onMoveDown} className="p-1 text-gray-300 hover:text-gray-600 text-xs">↓</button>
          )}
          <button onClick={() => setEditing(!editing)} className="p-1 text-gray-300 hover:text-blue-500 text-xs">✎</button>
          <button onClick={onRemove} className="p-1 text-gray-300 hover:text-red-500">
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {editing && (
        <div className="border-t border-gray-100 px-4 py-3 bg-gray-50">
          <NodeDataEditor type={node.type} data={node.data} onChange={onUpdate} />
        </div>
      )}
    </div>
  );
}

function nodePreview(node: FlowNode): string {
  switch (node.type) {
    case "welcome":
    case "text":
      return node.data.text?.slice(0, 60) || "No text set";
    case "menu":
      return `${(node.data.options || []).length} options: ${(node.data.options || []).map((o: any) => o.label).join(", ")}`;
    case "agent_handoff":
      return node.data.message || "Connecting to agent…";
    case "faq":
      return "Match incoming message to FAQ keywords";
    case "collect_info":
      return node.data.prompt || "Collect lead information";
    case "fallback":
      return node.data.text || "Sorry, I didn't understand that.";
    default:
      return "";
  }
}

// ─── Node data editor ─────────────────────────────────────────────────────────

function NodeDataEditor({ type, data, onChange }: { type: string; data: any; onChange: (d: any) => void }) {
  const update = (key: string, val: any) => onChange({ ...data, [key]: val });

  switch (type) {
    case "welcome":
    case "text":
    case "fallback":
      return (
        <textarea
          value={data.text || ""}
          onChange={(e) => update("text", e.target.value)}
          rows={3}
          placeholder="Message text…"
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-green-500/20"
        />
      );
    case "menu":
      return (
        <div className="space-y-2">
          <textarea
            value={data.body || ""}
            onChange={(e) => update("body", e.target.value)}
            rows={2}
            placeholder="Menu intro message…"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-green-500/20"
          />
          <div className="text-xs text-gray-500 font-medium">Options (one per line, format: Label)</div>
          <textarea
            value={(data.options || []).map((o: any) => o.label).join("\n")}
            onChange={(e) => {
              const opts = e.target.value.split("\n").filter(Boolean).map((l: string, i: number) => ({
                id: `opt_${i}`,
                label: l.trim(),
                target_node_id: null,
              }));
              update("options", opts);
            }}
            rows={4}
            placeholder={"View Products\nCheck Pricing\nContact Us\nSupport"}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none font-mono focus:outline-none focus:ring-2 focus:ring-green-500/20"
          />
        </div>
      );
    case "agent_handoff":
      return (
        <input
          value={data.message || ""}
          onChange={(e) => update("message", e.target.value)}
          placeholder="Message before handing off…"
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500/20"
        />
      );
    case "collect_info":
      return (
        <input
          value={data.prompt || ""}
          onChange={(e) => update("prompt", e.target.value)}
          placeholder="Please share your details…"
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500/20"
        />
      );
    default:
      return <p className="text-xs text-gray-400">No editable data for this node type.</p>;
  }
}

// ─── Add node modal ────────────────────────────────────────────────────────────

function AddNodeModal({ type, form, setForm, onAdd, onClose }: any) {
  const nt = NODE_TYPES.find((n) => n.type === type);
  return (
    <Modal open={true} onClose={onClose} title={`Add ${nt?.label}`}>
      <div className="space-y-3">
        <NodeDataEditor type={type} data={form} onChange={setForm} />
        <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
          <Button size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" variant="primary" onClick={onAdd}>Add Node</Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Test Flow Modal ──────────────────────────────────────────────────────────

function TestFlowModal({ flowId, open, onClose }: { flowId: string; open: boolean; onClose: () => void }) {
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const test = async () => {
    if (!message.trim()) return;
    setLoading(true);
    try {
      const res = await apiClient.get(`/bot/flows/${flowId}/test`, { params: { message } });
      setResult(res.data);
    } catch {
      toast.error("Test failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Test Bot Flow" width="max-w-lg">
      <div className="space-y-4">
        <div className="flex gap-2">
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && test()}
            placeholder="Type a test message, e.g. 'hi' or '1'"
            className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400"
          />
          <Button size="sm" variant="primary" loading={loading} onClick={test}>Send</Button>
        </div>

        {result && (
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="text-xs text-gray-500 mb-2">
              Matched: <span className="font-medium text-gray-700 capitalize">{result.matched}</span>
            </div>
            <div className="space-y-2">
              {result.responses?.map((r: any, i: number) => (
                <div key={i} className="bg-green-100 rounded-xl px-3 py-2 text-sm text-gray-800 max-w-xs ml-auto whitespace-pre-wrap">
                  {r.content}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildNodeData(type: string, form: Record<string, any>) {
  return { ...form };
}

function buildEdges(nodes: FlowNode[]) {
  return nodes.slice(0, -1).map((n, i) => ({
    id: `edge_${n.id}_${nodes[i + 1].id}`,
    source: n.id,
    target: nodes[i + 1].id,
  }));
}
