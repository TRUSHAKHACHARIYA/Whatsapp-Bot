"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { MessageSquare, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { authApi } from "@/services/api";
import { useAuthStore } from "@/store/auth.store";
import { getApiErrorMessage } from "@/lib/api-error";
import { DEMO_CREDENTIALS } from "@/lib/mock-api/demo-credentials";

const MOCK_API = process.env.NEXT_PUBLIC_MOCK_API === "true";

const loginSchema = z.object({
  tenant_slug: z.string().min(1, "Company slug is required"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuthStore();
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: MOCK_API
      ? {
          tenant_slug: DEMO_CREDENTIALS.tenant_slug,
          email: DEMO_CREDENTIALS.email,
          password: DEMO_CREDENTIALS.password,
        }
      : undefined,
  });

  const onSubmit = async (data: LoginForm) => {
    setLoading(true);
    try {
      const res = await authApi.login(data);
      const { access_token, refresh_token, user } = res.data;
      login(user, access_token, refresh_token);
      toast.success(`Welcome back, ${user.name}!`);
      router.push("/dashboard");
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, "Login failed. Check your credentials."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 bg-green-500 rounded-xl flex items-center justify-center mb-3">
            <MessageSquare className="text-white" size={24} />
          </div>
          <h1 className="text-2xl font-semibold text-gray-900">WapiSend</h1>
          <p className="text-sm text-gray-500 mt-1">Sign in to your workspace</p>
        </div>

        {/* Form */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Company Slug</label>
              <input
                {...register("tenant_slug")}
                placeholder="acme-furniture"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-400"
              />
              {errors.tenant_slug && (
                <p className="text-xs text-red-500 mt-1">{errors.tenant_slug.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm text-gray-600 mb-1">Email</label>
              <input
                {...register("email")}
                type="email"
                placeholder="you@company.com"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-400"
              />
              {errors.email && (
                <p className="text-xs text-red-500 mt-1">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm text-gray-600 mb-1">Password</label>
              <input
                {...register("password")}
                type="password"
                placeholder="••••••••"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-400"
              />
              {errors.password && (
                <p className="text-xs text-red-500 mt-1">{errors.password.message}</p>
              )}
            </div>

            <div className="flex justify-end">
              <a href="/forgot-password" className="text-xs text-green-600 hover:underline">
                Forgot password?
              </a>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-green-500 hover:bg-green-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              Sign In
            </button>
          </form>
        </div>

        {MOCK_API && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
            <p className="font-medium mb-1">Demo login (pre-filled)</p>
            <p>Company slug: <span className="font-mono">{DEMO_CREDENTIALS.tenant_slug}</span></p>
            <p>Email: <span className="font-mono">{DEMO_CREDENTIALS.email}</span></p>
            <p>Password: <span className="font-mono">{DEMO_CREDENTIALS.password}</span></p>
          </div>
        )}

        <p className="text-center text-sm text-gray-500 mt-4">
          No account?{" "}
          <a href="/signup" className="text-green-600 hover:underline font-medium">
            Start free trial
          </a>
        </p>
      </div>
    </div>
  );
}
