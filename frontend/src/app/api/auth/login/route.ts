import { NextResponse } from "next/server";
import {
  createMockTokens,
  findUserByCredentials,
  toAuthUser,
} from "@/lib/mock-api/store";
import { isMockApiEnabled } from "@/lib/mock-api/enabled";

export async function POST(request: Request) {
  if (!isMockApiEnabled()) {
    return NextResponse.json({ detail: "Mock API is disabled." }, { status: 404 });
  }

  const body = await request.json();
  const user = findUserByCredentials(body.email, body.password, body.tenant_slug);

  if (!user) {
    return NextResponse.json(
      { detail: "Invalid credentials or tenant not found." },
      { status: 401 }
    );
  }

  return NextResponse.json({
    ...createMockTokens(user.id),
    user: toAuthUser(user),
  });
}
