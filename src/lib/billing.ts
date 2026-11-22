import { supabase } from "@/integrations/supabase/client";
import { balanceDue, invoiceTotals, type Invoice, type InvoiceItem } from "@/lib/accounting";

const db = supabase as any;

export type PayMode = "full" | "partial" | "unpaid";
export interface PaymentCapture { mode: PayMode; amount: number; method: string; reference: string; discount: number }
export const emptyCapture = (): PaymentCapture => ({ mode: "full", amount: 0, method: "Cash", reference: "", discount: 0 });

/** Amount actually collected now, clamped to [0, total]. */
export function amountToCollect(c: PaymentCapture, total: number): number {
  if (c.mode === "unpaid") return 0;
  if (c.mode === "full") return total;
  return Math.min(Math.max(Number(c.amount) || 0, 0), total);
}

/** Final report release is blocked while an invoice has a balance, unless an admin overrides. */
export function isReleaseBlocked(inv: Pick<Invoice, "total" | "amount_paid" | "status"> | null | undefined, adminOverride: boolean): boolean {
  if (!inv || adminOverride) return false;
  return balanceDue(inv) > 0;
}

export async function createInvoiceWithPayment(args: {
  patientName: string; patientPhone?: string | null; source: string; reference: string;
  items: InvoiceItem[]; capture: PaymentCapture; userId?: string | null;
}): Promise<Invoice> {
  const t = invoiceTotals(args.items, args.capture.discount);
  const { data: inv, error } = await db.from("invoices").insert({
    patient_name: args.patientName, patient_phone: args.patientPhone || null, source: args.source,
    reference: args.reference, subtotal: t.subtotal, discount: t.discount, total: t.total, created_by: args.userId ?? null,
  }).select().single();
  if (error) throw error;
  const ie = await db.from("invoice_items").insert(args.items.map((i) => ({ ...i, invoice_id: inv.id })));
  if (ie.error) throw ie.error;
  const amt = amountToCollect(args.capture, t.total);
  if (amt > 0) {
    const pe = await db.from("payments").insert({ invoice_id: inv.id, amount: amt, method: args.capture.method, reference: args.capture.reference || null, received_by: args.userId ?? null });
    if (pe.error) throw pe.error;
  }
  return (await fetchInvoice(inv.id))!;
}

const SELECT = "*, invoice_items(*), payments(*)";
export async function fetchInvoice(id: string): Promise<Invoice | null> {
  const { data, error } = await db.from("invoices").select(SELECT).eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}
export async function fetchInvoiceByReference(reference: string): Promise<Invoice | null> {
  const { data, error } = await db.from("invoices").select(SELECT).eq("reference", reference).neq("status", "Void").order("created_at", { ascending: false }).limit(1);
  if (error) throw error;
  return data?.[0] ?? null;
}
export async function fetchRecentInvoices(limit = 50): Promise<Invoice[]> {
  const { data, error } = await db.from("invoices").select(SELECT).order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return data ?? [];
}
