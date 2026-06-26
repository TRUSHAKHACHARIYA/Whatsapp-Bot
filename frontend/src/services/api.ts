import axios, { AxiosInstance } from "axios";

const MOCK_API = process.env.NEXT_PUBLIC_MOCK_API === "true";
const BASE_URL = MOCK_API
  ? "/api"
  : process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

// ─── Axios Instance ────────────────────────────────────────────────────────────

export const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 30000,
});

// ─── Auth interceptors ────────────────────────────────────────────────────────

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const refreshToken = localStorage.getItem("refresh_token");
        if (!refreshToken) throw new Error("No refresh token");

        const { data } = await axios.post(`${BASE_URL}/auth/refresh`, {
          refresh_token: refreshToken,
        });
        localStorage.setItem("access_token", data.access_token);
        localStorage.setItem("refresh_token", data.refresh_token);
        original.headers.Authorization = `Bearer ${data.access_token}`;
        return apiClient(original);
      } catch {
        localStorage.clear();
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const authApi = {
  signup: (data: {
    company_name: string;
    owner_name: string;
    owner_email: string;
    password: string;
  }) => apiClient.post("/auth/signup", data),

  login: (data: { email: string; password: string; tenant_slug: string }) =>
    apiClient.post("/auth/login", data),

  refresh: (refresh_token: string) =>
    apiClient.post("/auth/refresh", { refresh_token }),

  requestPasswordReset: (email: string, tenant_slug: string) =>
    apiClient.post("/auth/password-reset/request", { email, tenant_slug }),

  confirmPasswordReset: (token: string, new_password: string) =>
    apiClient.post("/auth/password-reset/confirm", { token, new_password }),
};

// ─── Leads ────────────────────────────────────────────────────────────────────

export const leadsApi = {
  list: (params?: { stage?: string; search?: string; skip?: number; limit?: number }) =>
    apiClient.get("/leads/", { params }),

  stats: () => apiClient.get("/leads/stats"),

  create: (data: {
    contact_id: string;
    stage?: string;
    source?: string;
    notes?: string;
    value?: number;
  }) => apiClient.post("/leads/", data),

  update: (id: string, data: { stage?: string; notes?: string; value?: number }) =>
    apiClient.patch(`/leads/${id}`, data),

  delete: (id: string) => apiClient.delete(`/leads/${id}`),
};

// ─── Campaigns ────────────────────────────────────────────────────────────────

export const campaignsApi = {
  list: (status?: string) => apiClient.get("/campaigns/", { params: { status } }),

  create: (data: {
    name: string;
    template_name: string;
    audience_filter?: object;
    scheduled_at?: string;
  }) => apiClient.post("/campaigns/", data),

  update: (id: string, data: object) => apiClient.patch(`/campaigns/${id}`, data),

  send: (id: string) => apiClient.post(`/campaigns/${id}/send`),

  delete: (id: string) => apiClient.delete(`/campaigns/${id}`),
};

// ─── Analytics ────────────────────────────────────────────────────────────────

export const analyticsApi = {
  dashboard: (days = 30) => apiClient.get("/analytics/dashboard", { params: { days } }),
  agentPerformance: (days = 30) =>
    apiClient.get("/analytics/agent-performance", { params: { days } }),
  faqPerformance: () => apiClient.get("/analytics/faq-performance"),
};

// ─── WhatsApp ─────────────────────────────────────────────────────────────────

export const whatsappApi = {
  listAccounts: () => apiClient.get("/whatsapp/accounts"),
  createAccount: (data: {
    phone_number: string;
    phone_number_id: string;
    waba_id: string;
    access_token: string;
    display_name?: string;
  }) => apiClient.post("/whatsapp/accounts", data),
};
