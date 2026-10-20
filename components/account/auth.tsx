"use client";

import {
  useAuth as useClerkAuth, useUser as useClerkUser,
  Show as ClerkShow, SignInButton as ClerkSignInButton, UserButton as ClerkUserButton,
} from "@clerk/nextjs";
import type { ComponentProps } from "react";
import { AUTH_ENABLED } from "@/lib/auth-config";

const useLocalAuth = () => ({ isLoaded: true, isSignedIn: false, userId: null });
const useLocalUser = () => ({ isLoaded: true, isSignedIn: false, user: null });
export const useAuth = AUTH_ENABLED ? useClerkAuth : useLocalAuth;
export const useUser = AUTH_ENABLED ? useClerkUser : useLocalUser;
export function Show(props: ComponentProps<typeof ClerkShow>) { return AUTH_ENABLED ? <ClerkShow {...props} /> : null; }
export function SignInButton(props: ComponentProps<typeof ClerkSignInButton>) { return AUTH_ENABLED ? <ClerkSignInButton {...props} /> : null; }
export function UserButton(props: ComponentProps<typeof ClerkUserButton>) { return AUTH_ENABLED ? <ClerkUserButton {...props} /> : null; }
