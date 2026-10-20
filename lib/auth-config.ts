/** Without Clerk keys the personal reader stays entirely signed out. */
export const AUTH_ENABLED = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
