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
        <ul className="space-y-1 text-sm">
          {entschieden.map((a) => (
            <li key={a.id} className="flex gap-3">
              <span className="w-24 text-muted-foreground">
                {a.status === "freigegeben" ? "freigegeben" : "abgelehnt"}
              </span>
              <span>{a.firmenname}</span>
              <span className="text-muted-foreground">{a.email}</span>
            </li>
          ))}
          {entschieden.length === 0 ? <li className="text-muted-foreground">Noch nichts.</li> : null}
        </ul>
      </div>
    </div>
  );
}
