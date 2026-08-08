import { AlertTriangle } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/auth/platform-admin";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { AnmeldungKarte } from "@/components/admin/anmeldung-karte";

export const dynamic = "force-dynamic";

export default async function AnmeldungenPage() {
  await requirePlatformAdmin();

  const [wartend, entschieden] = await Promise.all([
    prisma.signupRequest.findMany({ where: { status: "bestaetigt" }, orderBy: { createdAt: "asc" } }),
    prisma.signupRequest.findMany({
      where: { status: { in: ["freigegeben", "abgelehnt"] } },
      orderBy: { entschiedenAm: "desc" },
      take: 25,
    }),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Plattform"
        title="Anmeldungen"
        subtitle={`${wartend.length} ${wartend.length === 1 ? "Anmeldung wartet" : "Anmeldungen warten"} auf Freigabe.`}
      />

      {wartend.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Gerade wartet nichts. Bestätigte Anmeldungen erscheinen hier automatisch.
        </p>
      ) : (
        <div className="space-y-4">
          {wartend.map((a) => (
            <AnmeldungKarte key={a.id} antrag={{ ...a, createdAt: a.createdAt.toISOString() }} />
          ))}
        </div>
      )}

      <div className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Zuletzt entschieden</h2>
        <ul className="space-y-1.5 text-sm">
          {entschieden.map((a) => (
            <li key={a.id}>
              <div className="flex gap-3">
                <span className="w-24 shrink-0 text-muted-foreground">
                  {a.status === "freigegeben" ? "freigegeben" : "abgelehnt"}
                </span>
                <span>{a.firmenname}</span>
                <span className="text-muted-foreground">{a.email}</span>
              </div>
              {/* `ablehnungsgrund` traegt bei "freigegeben" keinen Ablehnungsgrund,
                  sondern einen Betreiber-Hinweis (z. B. gescheiterte Willkommensmail)
                  – deutlich hervorgehoben, sonst haelt der Betreiber den Kunden faelschlich
                  fuer benachrichtigt. Bei "abgelehnt" ist es der tatsaechliche Grund. */}
              {a.status === "freigegeben" && a.ablehnungsgrund ? (
                <div className="ml-[6.75rem] mt-0.5 flex items-start gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-2 py-1 text-xs font-medium text-[hsl(var(--warning))]">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span>{a.ablehnungsgrund}</span>
                </div>
              ) : null}
              {a.status === "abgelehnt" && a.ablehnungsgrund ? (
                <p className="ml-[6.75rem] mt-0.5 text-xs text-muted-foreground">Grund: {a.ablehnungsgrund}</p>
              ) : null}
            </li>
          ))}
          {entschieden.length === 0 ? <li className="text-muted-foreground">Noch nichts.</li> : null}
        </ul>
      </div>
    </div>
  );
}
