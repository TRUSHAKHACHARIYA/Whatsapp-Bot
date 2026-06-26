"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Settings, Building2, Users, Smartphone, Palette, Key, Trash2, Plus, Eye, EyeOff } from "lucide-react";
import { apiClient } from "@/services/api";
import { Button, Card, Avatar, Modal, Spinner } from "@/components/ui";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuthStore } from "@/store/auth.store";
import AppLayout, { Topbar } from "@/components/layout/AppLayout";

const SECTIONS = [
  { id: "profile", label: "Company Profile", icon: Building2 },
  { id: "team", label: "Team Members", icon: Users },
  { id: "whatsapp", label: "WhatsApp Account", icon: Smartphone },
  { id: "branding", label: "Branding", icon: Palette },
  { id: "security", label: "Security", icon: Key },
];

export default function SettingsPage() {
  const [section, setSection] = useState("profile");

  return (
    <AppLayout>
      <Topbar title="Settings" />
      <div className="flex-1 overflow-hidden flex">
        {/* Sidebar */}
        <div className="w-52 bg-white border-r border-gray-100 p-3 flex-shrink-0">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors mb-0.5",
                section === s.id ? "bg-green-50 text-green-700 font-medium" : "text-gray-600 hover:bg-gray-50"
              )}
            >
              <s.icon size={14} className={section === s.id ? "text-green-600" : "text-gray-400"} />
              {s.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {section === "profile" && <CompanyProfileSection />}
          {section === "team" && <TeamSection />}
          {section === "whatsapp" && <WhatsAppSection />}
          {section === "branding" && <BrandingSection />}
          {section === "security" && <SecuritySection />}
        </div>
      </div>
    </AppLayout>
  );
}

// ─── Company Profile ──────────────────────────────────────────────────────────

function CompanyProfileSection() {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);

  const { data: tenant, isLoading } = useQuery({
    queryKey: ["tenant-profile"],
    queryFn: () => apiClient.get("/tenants/me").then((r) => r.data),
  });

  const [form, setForm] = useState({ name: "", custom_domain: "", email_from_name: "", email_from_address: "" });

  useState(() => {
    if (tenant) {
      setForm({
        name: tenant.name || "",
        custom_domain: tenant.custom_domain || "",
        email_from_name: tenant.email_from_name || "",
        email_from_address: tenant.email_from_address || "",
      });
    }
  });

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiClient.patch("/tenants/me", form);
      qc.invalidateQueries({ queryKey: ["tenant-profile"] });
      toast.success("Profile updated.");
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to update profile.");
    } finally { setSaving(false); }
  };

  if (isLoading) return <div className="flex justify-center py-8"><Spinner /></div>;

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h2 className="text-sm font-semibold text-gray-900 mb-1">Company Profile</h2>
        <p className="text-xs text-gray-500">This information is used across your workspace.</p>
      </div>

      <Card className="p-5 space-y-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Company Name</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Workspace Slug</label>
          <input value={tenant?.slug || ""} disabled
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 text-gray-400 cursor-not-allowed" />
          <p className="text-xs text-gray-400 mt-1">Used for login. Cannot be changed.</p>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Custom Domain (optional)</label>
          <input value={form.custom_domain} onChange={(e) => setForm({ ...form, custom_domain: e.target.value })}
            placeholder="app.yourcompany.com"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Email From Name</label>
            <input value={form.email_from_name} onChange={(e) => setForm({ ...form, email_from_name: e.target.value })}
              placeholder="Acme Furniture"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Email From Address</label>
            <input value={form.email_from_address} onChange={(e) => setForm({ ...form, email_from_address: e.target.value })}
              placeholder="hello@yourcompany.com"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
          </div>
        </div>

        <div className="flex justify-end pt-2 border-t border-gray-100">
          <Button variant="primary" size="sm" loading={saving} onClick={handleSave}>Save Changes</Button>
        </div>
      </Card>
    </div>
  );
}

// ─── Team ─────────────────────────────────────────────────────────────────────

function TeamSection() {
  const qc = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invite, setInvite] = useState({ name: "", email: "", role: "agent", password: "" });
  const [inviting, setInviting] = useState(false);

  const { data: team = [], isLoading } = useQuery({
    queryKey: ["team"],
    queryFn: () => apiClient.get("/tenants/team").then((r) => r.data),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/tenants/team/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["team"] }); toast.success("Member removed."); },
  });

  const handleInvite = async () => {
    if (!invite.name || !invite.email || !invite.password) { toast.error("All fields required."); return; }
    setInviting(true);
    try {
      await apiClient.post("/tenants/team", invite);
      toast.success(`${invite.name} added to the team.`);
      setInviteOpen(false);
      setInvite({ name: "", email: "", role: "agent", password: "" });
      qc.invalidateQueries({ queryKey: ["team"] });
    } catch (err: any) { toast.error(err.response?.data?.detail || "Failed to invite."); }
    finally { setInviting(false); }
  };

  const ROLE_COLORS: Record<string, string> = {
    owner: "bg-purple-50 text-purple-700",
    admin: "bg-blue-50 text-blue-700",
    agent: "bg-gray-100 text-gray-600",
  };

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Team Members</h2>
          <p className="text-xs text-gray-500 mt-0.5">{team.length} member{team.length !== 1 ? "s" : ""} in your workspace</p>
        </div>
        <Button variant="primary" size="sm" icon={<Plus size={13} />} onClick={() => setInviteOpen(true)}>
          Add Member
        </Button>
      </div>

      <Card>
        {isLoading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : (
          <div className="divide-y divide-gray-50">
            {team.map((member: any) => (
              <div key={member.id} className="flex items-center gap-3 px-4 py-3">
                <Avatar name={member.name} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">{member.name}</span>
                    <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium", ROLE_COLORS[member.role])}>
                      {member.role}
                    </span>
                    {!member.is_active && (
                      <span className="text-[10px] bg-red-50 text-red-500 px-2 py-0.5 rounded-full">Inactive</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400">{member.email}</div>
                </div>
                <div className="flex items-center gap-2">
                  <div className={cn("w-1.5 h-1.5 rounded-full", member.is_online ? "bg-green-400" : "bg-gray-300")} />
                  {member.role !== "owner" && (
                    <button
                      onClick={() => {
                        if (window.confirm(`Remove ${member.name} from the team?`)) {
                          removeMutation.mutate(member.id);
                        }
                      }}
                      className="p-1 text-gray-300 hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title="Add Team Member">
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Name</label>
            <input value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })}
              placeholder="Priya Sharma"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Email</label>
            <input value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} type="email"
              placeholder="priya@company.com"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Role</label>
            <select value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none">
              <option value="agent">Agent</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Temporary Password</label>
            <input value={invite.password} onChange={(e) => setInvite({ ...invite, password: e.target.value })} type="password"
              placeholder="They can change this later"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <Button size="sm" onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button size="sm" variant="primary" loading={inviting} onClick={handleInvite}>Add Member</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ─── WhatsApp Account ─────────────────────────────────────────────────────────

function WhatsAppSection() {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [form, setForm] = useState({ phone_number: "", phone_number_id: "", waba_id: "", access_token: "", display_name: "" });
  const [saving, setSaving] = useState(false);

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["whatsapp-accounts"],
    queryFn: () => apiClient.get("/whatsapp/accounts").then((r) => r.data),
  });

  const handleAdd = async () => {
    if (!form.phone_number || !form.phone_number_id || !form.waba_id || !form.access_token) {
      toast.error("All fields are required."); return;
    }
    setSaving(true);
    try {
      await apiClient.post("/whatsapp/accounts", form);
      toast.success("WhatsApp account connected.");
      setAddOpen(false);
      setForm({ phone_number: "", phone_number_id: "", waba_id: "", access_token: "", display_name: "" });
      qc.invalidateQueries({ queryKey: ["whatsapp-accounts"] });
    } catch (err: any) { toast.error(err.response?.data?.detail || "Failed to connect account."); }
    finally { setSaving(false); }
  };

  return (
    <div className="max-w-xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">WhatsApp Account</h2>
          <p className="text-xs text-gray-500 mt-0.5">Connect your WhatsApp Business number via Meta Cloud API.</p>
        </div>
        <Button variant="primary" size="sm" icon={<Plus size={13} />} onClick={() => setAddOpen(true)}>
          Connect Number
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Spinner /></div>
      ) : accounts.length === 0 ? (
        <Card className="p-8 text-center">
          <Smartphone size={32} className="text-gray-200 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-700 mb-1">No WhatsApp number connected</p>
          <p className="text-xs text-gray-400 mb-4">Connect your WhatsApp Business number to start receiving messages.</p>
          <Button variant="primary" size="sm" onClick={() => setAddOpen(true)}>Connect Number</Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {accounts.map((acc: any) => (
            <Card key={acc.id} className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
                <Smartphone size={18} className="text-green-500" />
              </div>
              <div>
                <div className="text-sm font-medium text-gray-900">{acc.display_name || acc.phone_number}</div>
                <div className="text-xs text-gray-400">{acc.phone_number}</div>
              </div>
              <div className="ml-auto">
                <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full font-medium">Active</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Connect WhatsApp Number" width="max-w-lg">
        <div className="space-y-3">
          <div className="bg-blue-50 text-blue-700 text-xs rounded-lg p-3">
            You need a Meta WhatsApp Business Account. Get your credentials from the{" "}
            <a href="https://developers.facebook.com" target="_blank" rel="noopener noreferrer" className="underline">
              Meta Developer Portal
            </a>.
          </div>
          {[
            { key: "display_name", label: "Display Name", placeholder: "Acme Store Support" },
            { key: "phone_number", label: "Phone Number", placeholder: "+919876543210" },
            { key: "phone_number_id", label: "Phone Number ID", placeholder: "From Meta WABA dashboard" },
            { key: "waba_id", label: "WhatsApp Business Account ID", placeholder: "From Meta WABA dashboard" },
          ].map(({ key, label, placeholder }) => (
            <div key={key}>
              <label className="block text-xs text-gray-500 mb-1">{label}</label>
              <input
                value={(form as any)[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                placeholder={placeholder}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400"
              />
            </div>
          ))}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Access Token</label>
            <div className="relative">
              <input
                type={showToken ? "text" : "password"}
                value={form.access_token}
                onChange={(e) => setForm({ ...form, access_token: e.target.value })}
                placeholder="EAA..."
                className="w-full pr-10 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400"
              />
              <button onClick={() => setShowToken(!showToken)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <Button size="sm" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button size="sm" variant="primary" loading={saving} onClick={handleAdd}>Connect</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ─── Branding ─────────────────────────────────────────────────────────────────

function BrandingSection() {
  const [color, setColor] = useState("#25D366");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiClient.patch("/tenants/me", { primary_color: color });
      toast.success("Branding updated.");
    } catch { toast.error("Failed to update branding."); }
    finally { setSaving(false); }
  };

  return (
    <div className="max-w-xl space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-900">Branding</h2>
        <p className="text-xs text-gray-500 mt-0.5">Customize the look of your workspace.</p>
      </div>
      <Card className="p-5 space-y-4">
        <div>
          <label className="block text-xs text-gray-500 mb-2">Primary Color</label>
          <div className="flex items-center gap-3">
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
              className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer" />
            <input value={color} onChange={(e) => setColor(e.target.value)}
              className="w-32 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20 font-mono" />
          </div>
        </div>
        <div className="flex justify-end pt-2 border-t border-gray-100">
          <Button variant="primary" size="sm" loading={saving} onClick={handleSave}>Save Branding</Button>
        </div>
      </Card>
    </div>
  );
}

// ─── Security ─────────────────────────────────────────────────────────────────

function SecuritySection() {
  const { user } = useAuthStore();
  const [form, setForm] = useState({ current_password: "", new_password: "", confirm_password: "" });
  const [saving, setSaving] = useState(false);

  const handleChange = async () => {
    if (form.new_password !== form.confirm_password) { toast.error("Passwords do not match."); return; }
    if (form.new_password.length < 8) { toast.error("Password must be at least 8 characters."); return; }
    setSaving(true);
    try {
      await apiClient.post("/tenants/profile/change-password", {
        current_password: form.current_password,
        new_password: form.new_password,
      });
      toast.success("Password changed successfully.");
      setForm({ current_password: "", new_password: "", confirm_password: "" });
    } catch (err: any) { toast.error(err.response?.data?.detail || "Failed to change password."); }
    finally { setSaving(false); }
  };

  return (
    <div className="max-w-xl space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-900">Security</h2>
        <p className="text-xs text-gray-500 mt-0.5">Manage your account password.</p>
      </div>
      <Card className="p-5 space-y-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Current Password</label>
          <input type="password" value={form.current_password} onChange={(e) => setForm({ ...form, current_password: e.target.value })}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">New Password</label>
          <input type="password" value={form.new_password} onChange={(e) => setForm({ ...form, new_password: e.target.value })}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Confirm New Password</label>
          <input type="password" value={form.confirm_password} onChange={(e) => setForm({ ...form, confirm_password: e.target.value })}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
        </div>
        <div className="flex justify-end pt-2 border-t border-gray-100">
          <Button variant="primary" size="sm" loading={saving} onClick={handleChange}>Change Password</Button>
        </div>
      </Card>
    </div>
  );
}
