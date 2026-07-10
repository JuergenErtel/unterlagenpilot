import Link from "next/link";
import { ArrowLeft, Phone, Mail, StickyNote, CalendarClock, CheckCircle2, Trash2, Banknote } from "lucide-react";
import { requireCaseAccess } from "@/lib/auth/context";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  setCaseBank,
  addCaseNote,
  setWiedervorlage,
  deleteCaseNote,
  addDeadline,
  toggleDeadline,
  markSubmittedToBank,
  addBankRequest,
  resolveMissingRequest,
  setCaseOutcome,
} from "@/lib/actions/case-management";
import {
  COMMON_BANKS,
  CASE_NOTE_KIND_LABELS,
  DEADLINE_KINDS,
  DEADLINE_KIND_LABELS,
  type CaseNoteKind,
  type DeadlineKind,
} from "@/lib/domain/enums";

export const dynamic = "force-dynamic";

function fmtDate(d: Date): string {
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function eur(n: number | null): string {
  return n == null ? "—" : `${Math.round(n).toLocaleString("de-DE")} €`;
}
function isoDate(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

const NOTE_ICON: Record<CaseNoteKind, typeof Phone> = {
  telefon: Phone,
  email: Mail,
  notiz: StickyNote,
  wiedervorlage: CalendarClock,
};

export default async function VerwaltungPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireCaseAccess(id);

  const c = await prisma.case.findUniqueOrThrow({
    where: { id },
    include: {
      caseNotes: { orderBy: { createdAt: "desc" }, include: { author: { select: { name: true } } } },
      deadlines: { orderBy: { dueDate: "asc" } },
      missingRequests: { where: { requestSource: "bank" }, orderBy: { createdAt: "desc" } },
    },
  });

  const courtage =
    c.darlehensbetrag != null && c.courtageProzent != null
      ? (c.darlehensbetrag * c.courtageProzent) / 100
      : null;
  const heute = new Date();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Fallverwaltung"
        title="Verwaltung & Nachverfolgung"
        subtitle="Bank, Wiedervorlagen, Kontakthistorie, Fristen, Bank-Nachforderungen und Abschlussdaten."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href={`/cases/${id}`}><ArrowLeft />Zur Fallakte</Link>
          </Button>
        }
      />

      {/* Bank */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><Banknote className="h-4 w-4" />Ziel-/einreichende Bank</CardTitle>
          <CardDescription>Steuert bankindividuelle Anforderungen in der Checkliste und die Aufbereitung.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={setCaseBank.bind(null, id)} className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="bankName">Bank auswählen</Label>
              <select
                id="bankName"
                name="bankName"
                defaultValue={COMMON_BANKS.includes(c.bankName as (typeof COMMON_BANKS)[number]) ? c.bankName ?? "" : ""}
                className="flex h-10 w-56 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">– keine / Andere –</option>
                {COMMON_BANKS.map((b) => (<option key={b} value={b}>{b}</option>))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bankNameFree">oder Freitext</Label>
              <Input
                id="bankNameFree"
                name="bankNameFree"
                placeholder="Andere Bank …"
                defaultValue={COMMON_BANKS.includes(c.bankName as (typeof COMMON_BANKS)[number]) ? "" : c.bankName ?? ""}
                className="w-56"
              />
            </div>
            <SubmitButton size="sm" pendingLabel="Speichern …">Bank speichern</SubmitButton>
            {c.bankName && <Badge variant="neutral" className="mb-2">Aktuell: {c.bankName}</Badge>}
          </form>
        </CardContent>
      </Card>

      {/* Bank-Status & Nachforderungen */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Nach der Einreichung</CardTitle>
          <CardDescription>Bei Bank einreichen, Nachforderungen mit Frist erfassen und abhaken.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <form action={markSubmittedToBank.bind(null, id)}>
              <SubmitButton size="sm" variant="outline" pendingLabel="…">Als „bei Bank eingereicht" markieren</SubmitButton>
            </form>
            <Badge variant={c.status === "bank_nachforderung" ? "warning" : "neutral"}>Status: {c.status}</Badge>
          </div>

          {c.missingRequests.length > 0 && (
            <ul className="space-y-2">
              {c.missingRequests.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
                  <div>
                    <div className={r.resolved ? "text-muted-foreground line-through" : "font-medium"}>{r.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.dueDate ? `Frist: ${fmtDate(r.dueDate)}` : "ohne Frist"}
                      {r.dueDate && !r.resolved && r.dueDate < heute ? " · überfällig" : ""}
                    </div>
                  </div>
                  {!r.resolved && (
                    <form action={resolveMissingRequest.bind(null, r.id)}>
                      <SubmitButton size="sm" variant="ghost" pendingLabel="…"><CheckCircle2 className="h-4 w-4" />Erledigt</SubmitButton>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}

          <form action={addBankRequest.bind(null, id)} className="flex flex-wrap items-end gap-3 border-t pt-3">
            <div className="space-y-1.5">
              <Label htmlFor="br-title">Nachforderung</Label>
              <Input id="br-title" name="title" placeholder="z. B. aktuelle Gehaltsabrechnung" className="w-64" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="br-due">Frist</Label>
              <Input id="br-due" name="dueDate" type="date" className="w-40" />
            </div>
            <SubmitButton size="sm" pendingLabel="…">Nachforderung erfassen</SubmitButton>
          </form>
        </CardContent>
      </Card>

      {/* Fristen */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><CalendarClock className="h-4 w-4" />Fristen</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {c.deadlines.length === 0 && <p className="text-sm text-muted-foreground">Keine Fristen erfasst.</p>}
          {c.deadlines.map((d) => {
            const overdue = !d.done && d.dueDate < heute;
            return (
              <div key={d.id} className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
                <div>
                  <div className={d.done ? "text-muted-foreground line-through" : "font-medium"}>
                    {DEADLINE_KIND_LABELS[d.kind as DeadlineKind]}: {d.title}
                  </div>
                  <div className={`text-xs ${overdue ? "text-destructive" : "text-muted-foreground"}`}>
                    {fmtDate(d.dueDate)}{overdue ? " · überfällig" : ""}
                  </div>
                </div>
                <form action={toggleDeadline.bind(null, d.id)}>
                  <SubmitButton size="sm" variant="ghost" pendingLabel="…">{d.done ? "Wieder öffnen" : "Erledigt"}</SubmitButton>
                </form>
              </div>
            );
          })}
          <form action={addDeadline.bind(null, id)} className="flex flex-wrap items-end gap-3 border-t pt-3">
            <div className="space-y-1.5">
              <Label htmlFor="dl-kind">Art</Label>
              <select id="dl-kind" name="kind" className="flex h-10 w-44 rounded-md border border-input bg-background px-3 text-sm">
                {DEADLINE_KINDS.map((k) => (<option key={k} value={k}>{DEADLINE_KIND_LABELS[k]}</option>))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dl-title">Bezeichnung</Label>
              <Input id="dl-title" name="title" placeholder="z. B. Angebot gültig bis" className="w-56" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dl-due">Datum</Label>
              <Input id="dl-due" name="dueDate" type="date" className="w-40" required />
            </div>
            <SubmitButton size="sm" pendingLabel="…">Frist anlegen</SubmitButton>
          </form>
        </CardContent>
      </Card>

      {/* Wiedervorlage + Kontakthistorie */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Kontakthistorie & Wiedervorlage</CardTitle>
          <CardDescription>
            {c.wiedervorlage ? `Nächste Wiedervorlage: ${fmtDate(c.wiedervorlage)}` : "Keine Wiedervorlage gesetzt."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form action={addCaseNote.bind(null, id)} className="space-y-2">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="note-kind">Art</Label>
                <select id="note-kind" name="kind" className="flex h-10 w-40 rounded-md border border-input bg-background px-3 text-sm">
                  {(Object.keys(CASE_NOTE_KIND_LABELS) as CaseNoteKind[]).map((k) => (
                    <option key={k} value={k}>{CASE_NOTE_KIND_LABELS[k]}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="note-wv">Wiedervorlage (bei Art „Wiedervorlage")</Label>
                <Input id="note-wv" name="wiedervorlage" type="date" className="w-40" />
              </div>
            </div>
            <Textarea name="body" placeholder="Notiz / Gesprächsvermerk …" rows={2} required />
            <SubmitButton size="sm" pendingLabel="Speichern …">Vermerk hinzufügen</SubmitButton>
          </form>

          <div className="space-y-2 border-t pt-3">
            {c.caseNotes.length === 0 && <p className="text-sm text-muted-foreground">Noch keine Vermerke.</p>}
            {c.caseNotes.map((n) => {
              const Icon = NOTE_ICON[n.kind as CaseNoteKind];
              return (
                <div key={n.id} className="flex items-start gap-3 rounded-md border p-3 text-sm">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{CASE_NOTE_KIND_LABELS[n.kind as CaseNoteKind]}</span>
                      <span>·</span>
                      <span>{fmtDate(n.createdAt)}</span>
                      {n.author?.name && (<><span>·</span><span>{n.author.name}</span></>)}
                    </div>
                    <p className="whitespace-pre-wrap">{n.body}</p>
                  </div>
                  <form action={deleteCaseNote.bind(null, n.id)}>
                    <button type="submit" aria-label="Vermerk löschen" className="rounded p-1 text-muted-foreground hover:bg-muted">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </form>
                </div>
              );
            })}
          </div>

          {c.wiedervorlage && (
            <form action={setWiedervorlage.bind(null, id)}>
              <input type="hidden" name="wiedervorlage" value="" />
              <SubmitButton size="sm" variant="ghost" pendingLabel="…">Wiedervorlage entfernen</SubmitButton>
            </form>
          )}
        </CardContent>
      </Card>

      {/* Abschlussdaten / Provision */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Abschlussdaten (Provision)</CardTitle>
          <CardDescription>Nach der Zusage erfassen – Grundlage fürs Provisions-/Pipeline-Tracking.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={setCaseOutcome.bind(null, id)} className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="o-bank">Abschluss-Bank</Label>
              <Input id="o-bank" name="abschlussBank" defaultValue={c.abschlussBank ?? c.bankName ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="o-betrag">Darlehensbetrag (€)</Label>
              <Input id="o-betrag" name="darlehensbetrag" inputMode="numeric" defaultValue={c.darlehensbetrag ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="o-zins">Sollzins (%)</Label>
              <Input id="o-zins" name="sollzinsProzent" inputMode="decimal" defaultValue={c.sollzinsProzent ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="o-courtage">Courtage (%)</Label>
              <Input id="o-courtage" name="courtageProzent" inputMode="decimal" defaultValue={c.courtageProzent ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="o-datum">Abschlussdatum</Label>
              <Input id="o-datum" name="abschlussdatum" type="date" defaultValue={isoDate(c.abschlussdatum)} />
            </div>
            <div className="flex items-end gap-2 pb-2">
              <input type="checkbox" id="o-closed" name="markClosed" className="h-4 w-4" />
              <Label htmlFor="o-closed">Fall als abgeschlossen markieren</Label>
            </div>
            <div className="sm:col-span-2 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Erwartete Courtage: <span className="font-medium text-foreground">{eur(courtage)}</span>
              </p>
              <SubmitButton size="sm" pendingLabel="Speichern …">Abschluss speichern</SubmitButton>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
