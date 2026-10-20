"use client";

import { Show, SignInButton, UserButton } from "@/components/account/auth";
import { barBtn } from "@/components/ui/Popover";

/** Signed out: a quiet "Sign in". Signed in: the avatar, with Clerk's account menu. */
export function Account() {
  return (
    <>
      <Show when="signed-out">
        <SignInButton mode="modal">
          <button type="button" className={`${barBtn} !px-3 whitespace-nowrap`} data-tip="Keep your highlights and notes on every device">
            Sign in
          </button>
        </SignInButton>
      </Show>
      <Show when="signed-in">
        <span className="grid size-9 place-items-center">
          <UserButton appearance={{ elements: { avatarBox: "size-7" } }} />
        </span>
      </Show>
    </>
  );
}
