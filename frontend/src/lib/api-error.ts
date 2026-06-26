export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (!error || typeof error !== "object") {
    return fallback;
  }

  const err = error as {
    response?: { data?: { detail?: string | { msg?: string }[] } };
    code?: string;
    message?: string;
  };

  const detail = err.response?.data?.detail;
  if (typeof detail === "string" && detail.length > 0) {
    return detail;
  }

  if (Array.isArray(detail) && detail[0]?.msg) {
    return detail[0].msg;
  }

  if (!err.response) {
    return "Cannot reach the API server. Start the backend or enable NEXT_PUBLIC_MOCK_API=true in frontend/.env.";
  }

  return fallback;
}
