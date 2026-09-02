import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AktionFormular } from "@/components/backoffice/aktion-formular";
import { prisma } from "@/lib/db";
import { roleAtLeast } from "@/lib/auth/context";
import { rolleSetzenAction } from "@/lib/actions/backoffice";
import { requireBackoffice } from "@/lib/backoffice/zugriff";
import {
  BACKOFFICE_ROLLEN,
  BACKOFFICE_ROLLE_LABELS,
  USER_ROLE_LABELS,
  type BackofficeRolle,
  type UserRole,
} from "@/lib/domain/enums";

export const dynamic = "force-dynamic";

const ROLLEN_BESCHREIBUNG: Record<BackofficeRolle, string> = {
  manager: "Legt Aufträge und Auftraggeber an, weist zu, steuert Prioritäten und Fristen, gibt frei und rechnet ab.",
  bearbeiter: "Bearbeitet die eigenen und die noch nicht zugewiesenen Aufträge, stellt Rückfragen und übergibt Ergebnisse.",
  pruefer: "Sieht alle Aufträge, erteilt die Qualitätsfreigabe oder gibt zur Nachbearbeitung zurück - nie die eigene Arbeit.",
};

export default async function TeamPage() {
  const ctx = await requireBackoffice();
  const darfRollenSetzen = ctx.backofficeRolle === "manager" || roleAtLeast(ctx.role, "org_admin");
  const nutzer = await prisma.user.findMany({
    where: { organizationId: ctx.organizationId, active: true },
    select: { id: true, name: true, email: true, role: true, backofficeRolle: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Verwaltung"
        title="Team"
        subtitle="Wer im Backoffice welche Rolle trägt. Die Vertriebsrolle bleibt davon unberührt."
      />

      <Card>
        <CardHeader>
          <CardTitle>Rollen im Backoffice</CardTitle>
          <CardDescription>Drei Rollen, klar getrennt - die Qualitätsfreigabe folgt dem Vier-Augen-Prinzip.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="space-y-2 text-sm">
            {BACKOFFICE_ROLLEN.map((r) => (
              <div key={r} className="grid gap-1 sm:grid-cols-[12rem_1fr] sm:gap-3">
                <dt>
                  <Badge variant="outline">{BACKOFFICE_ROLLE_LABELS[r]}</Badge>
                </dt>
                <dd className="text-muted-foreground">{ROLLEN_BESCHREIBUNG[r]}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mitglieder</CardTitle>
          <CardDescription>
            {nutzer.length} aktive {nutzer.length === 1 ? "Person" : "Personen"} in {ctx.organizationName}.
            {!darfRollenSetzen && " Rollen setzen Backoffice-Manager oder Organisationsadmins."}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>E-Mail</TableHead>
                  <TableHead>Vertriebsrolle</TableHead>
                  <TableHead>Backoffice-Rolle</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {nutzer.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.name}</TableCell>
                    <TableCell className="text-muted-foreground">{u.email}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{USER_ROLE_LABELS[u.role as UserRole] ?? u.role}</Badge>
                    </TableCell>
                    <TableCell>
                      {darfRollenSetzen ? (
                        <AktionFormular
                          aktion={rolleSetzenAction}
                          felder={{ userId: u.id }}
                          submitLabel="Speichern"
                          pendingLabel="Speichere …"
                          erfolg="Gespeichert."
                          size="sm"
                          variant="outline"
                          inline
                        >
                          <select name="rolle" defaultValue={u.backofficeRolle ?? ""} className="feld h-8 w-52" aria-label={`Backoffice-Rolle für ${u.name}`}>
                            <option value="">Keine</option>
                            {BACKOFFICE_ROLLEN.map((r) => (
                              <option key={r} value={r}>
                                {BACKOFFICE_ROLLE_LABELS[r]}
                              </option>
                            ))}
                          </select>
                        </AktionFormular>
                      ) : u.backofficeRolle ? (
                        <Badge variant="ai">{BACKOFFICE_ROLLE_LABELS[u.backofficeRolle as BackofficeRolle]}</Badge>
                      ) : (
                        <span className="text-sm text-muted-foreground">Keine</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {nutzer.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">
                      Keine aktiven Nutzer.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
