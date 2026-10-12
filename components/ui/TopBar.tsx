"use client";

import Link from "next/link";
import { Library, Printer } from "lucide-react";
import { Account } from "@/components/account/Account";
import { Lockup } from "@/components/brand/Gloss";
import { KeyMenu } from "@/components/ui/KeyMenu";
import { EDITIONS_ON } from "@/lib/edition";
import { SettingsMenu } from "@/components/ui/SettingsMenu";

const LINK =
  "inline-flex h-9 items-center gap-2 rounded-full px-3 text-[14px] font-medium text-ink-2 transition-colors hover:bg-sunk hover:text-ink aria-[current=page]:bg-sunk aria-[current=page]:text-ink max-sm:w-8 max-sm:justify-center max-sm:px-0";

/**
 * The bar across the top of the home page, the library and the print page: the
 * same pieces in the same places on each, so moving between them never shifts anything.
 */
export function TopBar({ here, onLibrary }: { here?: "library" | "print"; onLibrary?: () => void }) {
  return (
    <header className="relative z-20 mx-auto flex h-[var(--topbar-h)] w-full max-w-[1400px] shrink-0 items-center justify-between px-5 sm:px-8">
      <Lockup />
      <nav aria-label="Main" className="flex items-center gap-1">
        <Link
          href="/library"
          aria-current={here === "library" ? "page" : undefined}
          onClick={(e) => {
            if (!onLibrary) return;
            e.preventDefault();
            onLibrary();
          }}
          className={EDITIONS_ON ? LINK : `mr-1 ${LINK}`}
        >
          <Library size={17} />
          <span className="max-sm:hidden">Library</span>
        </Link>
        {EDITIONS_ON && (
          <Link href="/print" aria-current={here === "print" ? "page" : undefined} className={`mr-1 ${LINK}`}>
            <Printer size={16} />
            <span className="max-sm:hidden">Print</span>
          </Link>
        )}
        <SettingsMenu compact />
        <KeyMenu />
        <Account />
      </nav>
    </header>
  );
}
