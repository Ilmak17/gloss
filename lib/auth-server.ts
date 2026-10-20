import { auth as clerkAuth } from "@clerk/nextjs/server";
import { AUTH_ENABLED } from "./auth-config";

export async function auth() {
  return AUTH_ENABLED ? clerkAuth() : { userId: null };
}
