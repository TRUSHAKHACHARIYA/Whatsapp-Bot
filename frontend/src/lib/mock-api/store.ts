export interface MockUser {
  id: string;
  name: string;
  email: string;
  password: string;
  role: "owner" | "admin" | "agent";
  tenant_id: string;
  tenant_slug: string;
  tenant_name: string;
}

function deriveSlug(companyName: string): string {
  return companyName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

function createId(): string {
  return crypto.randomUUID();
}

const globalStore = globalThis as typeof globalThis & {
  __wapisendMockUsers?: MockUser[];
};

import { DEMO_CREDENTIALS } from "./demo-credentials";

const DEMO_USER: MockUser = {
  id: "00000000-0000-4000-8000-000000000001",
  name: DEMO_CREDENTIALS.name,
  email: DEMO_CREDENTIALS.email,
  password: DEMO_CREDENTIALS.password,
  role: "owner",
  tenant_id: "00000000-0000-4000-8000-000000000002",
  tenant_slug: DEMO_CREDENTIALS.tenant_slug,
  tenant_name: DEMO_CREDENTIALS.tenant_name,
};

function getUsers(): MockUser[] {
  if (!globalStore.__wapisendMockUsers) {
    globalStore.__wapisendMockUsers = [DEMO_USER];
    return globalStore.__wapisendMockUsers;
  }

  const hasDemoUser = globalStore.__wapisendMockUsers.some(
    (u) => u.id === DEMO_USER.id || u.email === DEMO_USER.email
  );
  if (!hasDemoUser) {
    globalStore.__wapisendMockUsers.unshift(DEMO_USER);
  }

  return globalStore.__wapisendMockUsers;
}

export function findUserByCredentials(
  email: string,
  password: string,
  tenantSlug: string
): MockUser | undefined {
  return getUsers().find(
    (u) =>
      u.email.toLowerCase() === email.toLowerCase() &&
      u.password === password &&
      u.tenant_slug === tenantSlug
  );
}

export function findUserById(id: string): MockUser | undefined {
  return getUsers().find((u) => u.id === id);
}

export function registerUser(data: {
  company_name: string;
  owner_name: string;
  owner_email: string;
  password: string;
}): MockUser {
  const users = getUsers();
  const slug = deriveSlug(data.company_name);

  if (!slug) {
    throw new Error("INVALID_COMPANY_NAME");
  }

  if (users.some((u) => u.tenant_slug === slug)) {
    throw new Error("SLUG_EXISTS");
  }

  if (users.some((u) => u.email.toLowerCase() === data.owner_email.toLowerCase())) {
    throw new Error("EMAIL_EXISTS");
  }

  const user: MockUser = {
    id: createId(),
    name: data.owner_name,
    email: data.owner_email,
    password: data.password,
    role: "owner",
    tenant_id: createId(),
    tenant_slug: slug,
    tenant_name: data.company_name,
  };

  users.push(user);
  return user;
}

export function toAuthUser(user: MockUser) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    tenant_id: user.tenant_id,
    tenant_slug: user.tenant_slug,
    tenant_name: user.tenant_name,
  };
}

export function createMockTokens(userId: string) {
  return {
    access_token: `mock_access_${userId}`,
    refresh_token: `mock_refresh_${userId}`,
    token_type: "bearer",
  };
}

export function parseMockToken(token: string): string | null {
  if (token.startsWith("mock_access_")) {
    return token.replace("mock_access_", "");
  }
  if (token.startsWith("mock_refresh_")) {
    return token.replace("mock_refresh_", "");
  }
  return null;
}
