import { NextResponse } from "next/server";
import { isMockApiEnabled } from "@/lib/mock-api/enabled";

export async function GET(request: Request) {
  if (!isMockApiEnabled()) {
    return NextResponse.json({ detail: "Mock API is disabled." }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const days = Number(searchParams.get("days") || "30");

  return NextResponse.json({
    period_days: days,
    messages: {
      total: 2847,
      inbound: 1623,
      outbound: 1224,
    },
    leads: {
      new: 48,
      won: 12,
      conversion_rate: 24.5,
    },
    campaigns: {
      active: 3,
    },
    conversations: {
      bot_handled: 186,
      agent_handled: 64,
      automation_rate: 74.4,
    },
  });
}
