"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Search, Send, Paperclip, Bot, Headset, MoreHorizontal,
  Circle, CheckCheck, MessageSquare, Filter, Plus, RefreshCw
} from "lucide-react";
import { apiClient } from "@/services/api";
import { useAuthStore } from "@/store/auth.store";
import { Avatar, Badge, Button, Spinner, EmptyState } from "@/components/ui";
import { cn, formatTime, STAGE_STYLES } from "@/lib/utils";
import { toast } from "sonner";
import AppLayout, { Topbar } from "@/components/layout/AppLayout";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Conversation {
  id: string;
  status: string;
  bot_active: boolean;
  unread_count: number;
  last_message_at: string;
  last_message_preview: string;
  contact: { id: string; name: string; phone: string; email: string; tags: string[]; source?: string; city?: string; created_at?: string };
  assigned_agent?: { id: string; name: string };
}

interface Message {
  id: string;
  direction: "inbound" | "outbound";
  message_type: string;
  content: string;
  status: string;
  is_internal_note: boolean;
  sent_by_agent_id?: string;
  created_at: string;
}

// ─── API calls ────────────────────────────────────────────────────────────────

const fetchConversations = (filter: string) =>
  apiClient.get("/chat/conversations", {
    params: filter === "mine" ? { assigned_to_me: true } : filter === "bot" ? { status: "bot" } : filter === "unread" ? { unread_only: true } : {},
  }).then((r) => r.data);

const fetchMessages = (convId: string) =>
  apiClient.get(`/chat/conversations/${convId}/messages`).then((r) => r.data);

const fetchConversation = (convId: string) =>
  apiClient.get(`/chat/conversations/${convId}`).then((r) => r.data);

// ─── Main page ────────────────────────────────────────────────────────────────

export default function InboxPage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [messageInput, setMessageInput] = useState("");
  const [sendingNote, setSendingNote] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const { data: conversations = [], isLoading: loadingConvs, refetch } = useQuery({
    queryKey: ["conversations", filter],
    queryFn: () => fetchConversations(filter),
    refetchInterval: 10000,
  });

  const { data: activeConv } = useQuery({
    queryKey: ["conversation", selectedId],
    queryFn: () => fetchConversation(selectedId!),
    enabled: !!selectedId,
  });

  const { data: messages = [], isLoading: loadingMsgs } = useQuery({
    queryKey: ["messages", selectedId],
    queryFn: () => fetchMessages(selectedId!),
    enabled: !!selectedId,
    refetchInterval: 5000,
  });

  // WebSocket connection
  useEffect(() => {
    if (!user?.tenant_id) return;
    const token = localStorage.getItem("access_token");
    const ws = new WebSocket(`ws://localhost:8000/api/chat/ws/${user.tenant_id}?token=${token}`);
    wsRef.current = ws;
    ws.onmessage = (e) => {
      const event = JSON.parse(e.data);
      if (event.event === "new_message") {
        qc.invalidateQueries({ queryKey: ["messages", event.conversation_id] });
        qc.invalidateQueries({ queryKey: ["conversations"] });
      }
      if (event.event === "agent_takeover" || event.event === "conversation_assigned") {
        qc.invalidateQueries({ queryKey: ["conversations"] });
        qc.invalidateQueries({ queryKey: ["conversation", event.conversation_id] });
      }
    };
    const ping = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send("ping"), 25000);
    return () => { clearInterval(ping); ws.close(); };
  }, [user?.tenant_id, qc]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMutation = useMutation({
    mutationFn: (payload: { content: string; is_internal_note: boolean }) =>
      apiClient.post(`/chat/conversations/${selectedId}/messages`, payload),
    onSuccess: () => {
      setMessageInput("");
      qc.invalidateQueries({ queryKey: ["messages", selectedId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: () => toast.error("Failed to send message"),
  });

  const takeoverMutation = useMutation({
    mutationFn: () => apiClient.post(`/chat/conversations/${selectedId}/takeover`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversation", selectedId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      toast.success("You took over the conversation. Bot paused.");
    },
  });

  const handbackMutation = useMutation({
    mutationFn: () => apiClient.post(`/chat/conversations/${selectedId}/handback`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversation", selectedId] });
      toast.success("Conversation returned to bot.");
    },
  });

  const resolvedMutation = useMutation({
    mutationFn: () =>
      apiClient.patch(`/chat/conversations/${selectedId}/status`, { status: "resolved" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["conversation", selectedId] });
      toast.success("Conversation resolved.");
    },
  });

  const handleSend = (isNote = false) => {
    if (!messageInput.trim() || !selectedId) return;
    sendMutation.mutate({ content: messageInput.trim(), is_internal_note: isNote });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(sendingNote); }
  };

  const filtered = conversations.filter((c: Conversation) =>
    search === "" ||
    c.contact.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.contact.phone.includes(search)
  );

  const selected = selectedId ? conversations.find((c: Conversation) => c.id === selectedId) || activeConv : null;

  return (
    <AppLayout>
      <div className="flex-1 flex overflow-hidden">
        {/* Conversation list */}
        <div className="w-72 bg-white border-r border-gray-100 flex flex-col flex-shrink-0">
          {/* Search */}
          <div className="p-3 border-b border-gray-100">
            <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
              <Search size={13} className="text-gray-400 flex-shrink-0" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search conversations…"
                className="flex-1 bg-transparent text-sm text-gray-700 placeholder:text-gray-400 outline-none"
              />
            </div>
          </div>

          {/* Filter tabs */}
          <div className="flex gap-1 px-3 py-2 border-b border-gray-100 overflow-x-auto">
            {["all", "mine", "bot", "unread"].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors",
                  filter === f ? "bg-green-50 text-green-700" : "text-gray-500 hover:text-gray-700"
                )}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
            <button onClick={() => refetch()} className="ml-auto text-gray-400 hover:text-gray-600">
              <RefreshCw size={12} />
            </button>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {loadingConvs ? (
              <div className="flex justify-center py-8"><Spinner /></div>
            ) : filtered.length === 0 ? (
              <EmptyState icon={<MessageSquare size={32} />} title="No conversations" description="Conversations will appear here." />
            ) : (
              filtered.map((conv: Conversation) => (
                <button
                  key={conv.id}
                  onClick={() => setSelectedId(conv.id)}
                  className={cn(
                    "w-full flex items-start gap-2.5 px-3 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors text-left",
                    selectedId === conv.id && "bg-green-50"
                  )}
                >
                  <Avatar name={conv.contact.name || conv.contact.phone} size="md" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-sm font-medium text-gray-900 truncate">
                        {conv.contact.name || conv.contact.phone}
                      </span>
                      <span className="text-[10px] text-gray-400 flex-shrink-0 ml-1">
                        {conv.last_message_at ? formatTime(conv.last_message_at) : ""}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-400 truncate">{conv.last_message_preview}</span>
                      <div className="flex items-center gap-1 flex-shrink-0 ml-1">
                        {conv.bot_active && <Bot size={10} className="text-green-400" />}
                        {conv.unread_count > 0 && (
                          <span className="w-4 h-4 bg-green-500 text-white text-[9px] rounded-full flex items-center justify-center">
                            {conv.unread_count > 9 ? "9+" : conv.unread_count}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Chat area */}
        {selectedId && selected ? (
          <div className="flex-1 flex overflow-hidden">
            {/* Messages */}
            <div className="flex-1 flex flex-col overflow-hidden bg-white">
              {/* Chat topbar */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 flex-shrink-0">
                <Avatar name={selected.contact?.name || selected.contact?.phone || "?"} />
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-900">
                    {selected.contact?.name || selected.contact?.phone}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-gray-400">
                    <Circle size={6} className={cn("fill-current", activeConv?.status !== "resolved" ? "text-green-400" : "text-gray-300")} />
                    {selected.contact?.phone}
                    {selected.bot_active && <span className="ml-1 text-green-600">· Bot active</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {selected.bot_active ? (
                    <Button size="sm" variant="primary" icon={<Headset size={13} />} onClick={() => takeoverMutation.mutate()} loading={takeoverMutation.isPending}>
                      Take Over
                    </Button>
                  ) : (
                    <Button size="sm" icon={<Bot size={13} />} onClick={() => handbackMutation.mutate()} loading={handbackMutation.isPending}>
                      Return to Bot
                    </Button>
                  )}
                  <Button size="sm" onClick={() => resolvedMutation.mutate()} loading={resolvedMutation.isPending}>
                    Resolve
                  </Button>
                  <button className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50">
                    <MoreHorizontal size={15} />
                  </button>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
                {loadingMsgs ? (
                  <div className="flex justify-center py-8"><Spinner /></div>
                ) : (
                  messages.map((msg: Message) => (
                    <div key={msg.id} className={cn("flex", msg.direction === "outbound" ? "justify-end" : "justify-start")}>
                      {msg.is_internal_note ? (
                        <div className="max-w-sm bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
                          <div className="font-medium mb-0.5">🔒 Internal note</div>
                          {msg.content}
                        </div>
                      ) : (
                        <div className={cn(
                          "max-w-xs lg:max-w-sm rounded-2xl px-3.5 py-2.5 text-sm",
                          msg.direction === "inbound"
                            ? "bg-white border border-gray-100 text-gray-900 rounded-tl-sm"
                            : "bg-green-100 text-gray-900 rounded-tr-sm"
                        )}>
                          <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                          <div className="flex items-center justify-end gap-1 mt-1">
                            <span className="text-[10px] text-gray-400">{formatTime(msg.created_at)}</span>
                            {msg.direction === "outbound" && (
                              <CheckCheck size={11} className={msg.status === "read" ? "text-green-500" : "text-gray-400"} />
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              {!selected.bot_active && (
                <div className="border-t border-gray-100 bg-white p-3">
                  {/* Note toggle */}
                  <div className="flex gap-2 mb-2">
                    <button
                      onClick={() => setSendingNote(false)}
                      className={cn("text-xs px-2.5 py-1 rounded-md transition-colors", !sendingNote ? "bg-gray-900 text-white" : "text-gray-500 hover:text-gray-700")}
                    >Reply</button>
                    <button
                      onClick={() => setSendingNote(true)}
                      className={cn("text-xs px-2.5 py-1 rounded-md transition-colors", sendingNote ? "bg-amber-100 text-amber-700" : "text-gray-500 hover:text-gray-700")}
                    >🔒 Note</button>
                  </div>
                  <div className={cn("flex items-end gap-2 rounded-xl border p-2", sendingNote ? "border-amber-300 bg-amber-50" : "border-gray-200")}>
                    <textarea
                      value={messageInput}
                      onChange={(e) => setMessageInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={sendingNote ? "Add an internal note…" : "Type a message…"}
                      rows={2}
                      className="flex-1 text-sm bg-transparent resize-none outline-none text-gray-900 placeholder:text-gray-400"
                    />
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600"><Paperclip size={15} /></button>
                      <button
                        onClick={() => handleSend(sendingNote)}
                        disabled={!messageInput.trim() || sendMutation.isPending}
                        className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center hover:bg-green-600 transition-colors disabled:opacity-40"
                      >
                        <Send size={14} className="text-white" />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {selected.bot_active && (
                <div className="border-t border-gray-100 bg-gray-50 px-4 py-3 flex items-center gap-2">
                  <Bot size={14} className="text-green-500" />
                  <span className="text-xs text-gray-500">Bot is handling this conversation. Click <strong>Take Over</strong> to reply.</span>
                </div>
              )}
            </div>

            {/* Contact panel */}
            <div className="w-64 bg-white border-l border-gray-100 overflow-y-auto flex-shrink-0">
              <div className="p-4 text-center border-b border-gray-100">
                <Avatar name={selected.contact?.name || selected.contact?.phone || "?"} size="lg" />
                <div className="text-sm font-semibold text-gray-900 mt-2">
                  {selected.contact?.name || "Unknown"}
                </div>
                <div className="text-xs text-gray-400">{selected.contact?.phone}</div>
                {activeConv?.contact?.tags?.length > 0 && (
                  <div className="flex flex-wrap justify-center gap-1 mt-2">
                    {activeConv.contact.tags.map((tag: string) => (
                      <span key={tag} className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{tag}</span>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-4 space-y-3">
                <div>
                  <div className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-2">Details</div>
                  <div className="space-y-2">
                    {[
                      { label: "Email", value: activeConv?.contact?.email },
                      { label: "City", value: activeConv?.contact?.city },
                      { label: "Source", value: activeConv?.contact?.source },
                    ].map(({ label, value }) => value ? (
                      <div key={label} className="flex justify-between text-xs">
                        <span className="text-gray-400">{label}</span>
                        <span className="text-gray-700 font-medium">{value}</span>
                      </div>
                    ) : null)}
                  </div>
                </div>

                {selected.assigned_agent && (
                  <div>
                    <div className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-2">Assigned To</div>
                    <div className="flex items-center gap-2">
                      <Avatar name={selected.assigned_agent.name} size="sm" />
                      <span className="text-xs text-gray-700">{selected.assigned_agent.name}</span>
                    </div>
                  </div>
                )}

                <div>
                  <div className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-2">Status</div>
                  <div className="flex items-center gap-2">
                    <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium",
                      selected.bot_active ? "bg-green-50 text-green-700" : "bg-blue-50 text-blue-700"
                    )}>
                      {selected.bot_active ? "🤖 Bot" : "👤 Agent"}
                    </span>
                    <span className="text-xs text-gray-500 capitalize">{selected.status}</span>
                  </div>
                </div>

                <a
                  href={`/leads?contact=${selected.contact?.id}`}
                  className="block w-full text-center text-xs text-green-600 hover:underline py-1"
                >
                  View Lead Profile →
                </a>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-gray-50">
            <EmptyState
              icon={<MessageSquare size={40} />}
              title="Select a conversation"
              description="Choose a conversation from the list to start chatting."
            />
          </div>
        )}
      </div>
    </AppLayout>
  );
}
