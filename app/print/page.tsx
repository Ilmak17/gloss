import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintPage } from "@/components/print/PrintPage";
import { EDITIONS_ON } from "@/lib/edition";
import "../library/edition.css";
import "./print.css";

export const metadata: Metadata = {
  title: "Print your book",
  description: "Everything you saved in a month, with your highlights and notes, as a 6 × 9 paperback under a cover drawn from it. Printed and posted for $25.",
  alternates: { canonical: "/print" },
};

export default function Print() {
  if (!EDITIONS_ON) notFound();
  return <PrintPage />;
}
