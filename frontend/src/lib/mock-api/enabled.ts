export function isMockApiEnabled(): boolean {
  return process.env.NEXT_PUBLIC_MOCK_API === "true";
}
