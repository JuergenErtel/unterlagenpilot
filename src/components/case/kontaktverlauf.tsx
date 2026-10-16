import { Phone, Mail, MessageCircle, MessageSquare, StickyNote, CalendarClock, Trash2 } from "lucide-react";
import { deleteCaseNote, setWiedervorlage } from "@/lib/actions/case-management";
import { Button } from "@/components/ui/button";
import { CASE_NOTE_KIND_LABELS, type CaseNoteKind } from "@/lib/domain/enums";

const SYMBOL: Record<CaseNoteKind, typeof Phone> = {
  telefon: Phone,
  email: Mail,
  whatsapp: MessageCircle,
  sms: MessageSquare,
  notiz: StickyNote,
  wiedervorlage: CalendarClock,
};

export interface KontaktverlaufEintrag {
  id: string;
  kind: string;
  body: string;
  createdAt: Date;
  autor: string | null;
}

/**
 * Die Vermerke des Falls (`CaseNote`) – Anrufe, SMS, WhatsApp – direkt unter
 * dem Notizblock. Bis 16.10.2026 standen sie nur auf der Seite "Verwaltung",
 * die Jürgen nicht gefunden hat; die Seite ist entfallen.
 *
 * Löschen ist wichtig: Ein versehentlicher Vermerk zählt sonst als Versuch
 * im Kontaktstand (kontakt.ts) und verschiebt den nächsten Anruf.
 */
export function Kontaktverlauf({
  caseId,
  eintraege,
  wiedervorlage,
}: {
  caseId: string;
  eintraege: KontaktverlaufEintrag[];
  wiedervorlage: Date | null;
}) {
  if (eintraege.length === 0 && !wiedervorlage) return null;
  return (
    <div id="kontaktverlauf" className="flaeche-ablage scroll-mt-20 space-y-2 px-4 py-3">
      <div className="eyebrow">Kontaktverlauf</div>
      {/* Die Leitersprosse "Wiedervorlage ist fällig" verweist hierher: Sie
          muss sich verschieben oder räumen lassen, sonst hält ein altes Datum
          den Fall für immer fest (next-step.ts). */}
      {wiedervorlage && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm">
          <CalendarClock className="h-4 w-4 text-muted-foreground" />
          <span>
            Wiedervorlage:{" "}
            <span className="font-medium">
              {wiedervorlage.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })}
            </span>
          </span>
          <form action={setWiedervorlage.bind(null, caseId)} className="flex items-center gap-2">
            <input
              type="date"
              name="wiedervorlage"
              required
              aria-label="Neues Datum"
              className="feld h-8 w-40"
            />
            <Button type="submit" size="sm" variant="outline">
              Verschieben
            </Button>
          </form>
          <form action={setWiedervorlage.bind(null, caseId)}>
            <input type="hidden" name="wiedervorlage" value="" />
            <Button type="submit" size="sm" variant="ghost">
              Erledigt
            </Button>
          </form>
        </div>
      )}
      <ul className="space-y-1.5">
        {eintraege.map((n) => {
          const Icon = SYMBOL[n.kind as CaseNoteKind] ?? StickyNote;
          return (
            <li key={n.id} className="flex items-start gap-2 text-sm">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="text-xs text-muted-foreground">
                  {CASE_NOTE_KIND_LABELS[n.kind as CaseNoteKind] ?? n.kind} ·{" "}
                  {n.createdAt.toLocaleString("de-DE", {
                    timeZone: "Europe/Berlin",
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  Uhr{n.autor ? ` · ${n.autor}` : ""}
                </div>
                <p className="line-clamp-2 whitespace-pre-wrap break-words">{n.body}</p>
              </div>
              <form action={deleteCaseNote.bind(null, n.id)}>
                <button
                  type="submit"
                  aria-label="Vermerk löschen"
                  title="Vermerk löschen"
                  className="rounded p-1 text-muted-foreground hover:bg-muted"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </form>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
