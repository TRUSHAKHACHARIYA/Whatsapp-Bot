import { NextResponse } from "next/server";
import {
  createMockTokens,
  registerUser,
  toAuthUser,
} from "@/lib/mock-api/store";
import { isMockApiEnabled } from "@/lib/mock-api/enabled";

export async function POST(request: Request) {
  if (!isMockApiEnabled()) {
    return NextResponse.json({ detail: "Mock API is disabled." }, { status: 404 });
  }

  const body = await request.json();

  try {
    const user = registerUser({
      company_name: body.company_name,
      owner_name: body.owner_name,
      owner_email: body.owner_email,
      password: body.password,
    });

    return NextResponse.json(
      {
        ...createMockTokens(user.id),
        user: toAuthUser(user),
      },
      { status: 201 }
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";

    if (code === "SLUG_EXISTS") {
      return NextResponse.json(
        { detail: "Company slug already exists. Try a different company name." },
        { status: 400 }
      );
    }

    if (code === "EMAIL_EXISTS") {
      return NextResponse.json(
        { detail: "An account with this email already exists." },
        { status: 400 }
      );
    }

    return NextResponse.json({ detail: "Registration failed." }, { status: 500 });
  }
}
