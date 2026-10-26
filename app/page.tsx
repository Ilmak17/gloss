import type { Metadata } from "next";
import { Library } from "@/components/library/Library";
import "./library/library.css";

export const metadata: Metadata = { title: "Gloss", alternates: { canonical: "/" } };

export default function Home() {
  return <Library />;
}
