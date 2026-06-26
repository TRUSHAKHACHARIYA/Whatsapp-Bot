"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { MessageCircle, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { authApi } from "@/services/api";
import { useAuthStore } from "@/store/auth.store";
import { getApiErrorMessage } from "@/lib/api-error";

const schema = z.object({
  company_name: z.string().min(2, "Company name must be at least 2 characters"),
  owner_name: z.string().min(2, "Your name is required"),
  owner_email: z.string().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirm_password: z.string(),
}).refine((d) => d.password === d.confirm_password, {
  message: "Passwords do not match",
  path: ["confirm_password"],
});

type SignupForm = z.infer<typeof schema>;

const FEATURES = [
  "WhatsApp Business integration",
  "Menu-based bot automation",
  "Lead capture & pipeline",
  "Live agent inbox",
  "Broadcast campaigns",
  "14-day free trial",
];

export default function SignupPage() {
  const router = useRouter();
  const { login } = useAuthStore();
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<SignupForm>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: SignupForm) => {
    setLoading(true);
    try {
      const res = await authApi.signup({
        company_name: data.company_name,
        owner_name: data.owner_name,
        owner_email: data.owner_email,
        password: data.password,
      });
      const { access_token, refresh_token, user } = res.data;
      login(user, access_token, refresh_token);
      toast.success("Welcome to WapiSend! Your workspace is ready.");
      router.push("/dashboard");
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, "Registration failed. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Left panel */}
      <div className="hidden lg:flex w-96 bg-green-600 flex-col justify-between p-10">
        <div>
          <div className="flex items-center gap-3 mb-12">
            <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
              <MessageCircle size={20} className="text-white" />
            </div>
            <span className="text-white font-semibold text-lg">WapiSend</span>
          </div>
          <h2 className="text-2xl font-bold text-white mb-3 leading-tight">
            WhatsApp automation for growing businesses
          </h2>
          <p className="text-green-100 text-sm leading-relaxed mb-8">
            Connect your WhatsApp Business account and start automating conversations, capturing leads, and running campaigns in minutes.
          </p>
          <div className="space-y-3">
            {FEATURES.map((f) => (
              <div key={f} className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                  <Check size={11} className="text-white" />
                </div>
                <span className="text-green-50 text-sm">{f}</span>
              </div>
            ))}
          </div>
        </div>
        <p className="text-green-200 text-xs">No credit card required for trial</p>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="mb-7">
            <h1 className="text-xl font-semibold text-gray-900">Create your workspace</h1>
            <p className="text-sm text-gray-500 mt-1">
              Already have one?{" "}
              <a href="/login" className="text-green-600 hover:underline">Sign in</a>
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Company Name</label>
              <input
                {...register("company_name")}
                placeholder="Acme Furniture Store"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400 bg-white"
              />
              {errors.company_name && <p className="text-xs text-red-500 mt-1">{errors.company_name.message}</p>}
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">Your Name</label>
              <input
                {...register("owner_name")}
                placeholder="Raj Kumar"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400 bg-white"
              />
              {errors.owner_name && <p className="text-xs text-red-500 mt-1">{errors.owner_name.message}</p>}
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">Work Email</label>
              <input
                {...register("owner_email")}
                type="email"
                placeholder="raj@acmefurniture.com"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400 bg-white"
              />
              {errors.owner_email && <p className="text-xs text-red-500 mt-1">{errors.owner_email.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Password</label>
                <input
                  {...register("password")}
                  type="password"
                  placeholder="Min 8 characters"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400 bg-white"
                />
                {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password.message}</p>}
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Confirm Password</label>
                <input
                  {...register("confirm_password")}
                  type="password"
                  placeholder="Repeat password"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400 bg-white"
                />
                {errors.confirm_password && <p className="text-xs text-red-500 mt-1">{errors.confirm_password.message}</p>}
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-green-500 hover:bg-green-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60 flex items-center justify-center gap-2 mt-2"
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              Start Free Trial
            </button>

            <p className="text-center text-xs text-gray-400">
              By signing up, you agree to our{" "}
              <a href="/terms" className="underline">Terms</a> and{" "}
              <a href="/privacy" className="underline">Privacy Policy</a>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
