import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/auth/platform-admin";
import { prisma } from "@/lib/db";
import { BACKOFFICE_FEATURE_KEY } from "@/lib/domain/enums";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BackofficeFlagForm } from "@/components/admin/backoffice-flag-form";
import { BackofficeManagerForm } from "@/components/admin/backoffice-manager-form";

export const dynamic = "force-dynamic";

/**
 * Plattform-Steuerung des Backoffice: je Organisation das Feature Flag und
 * der erste Manager. Liegt wie /admin/anmeldungen ausserhalb der App-Shell
 * und bekommt denselben schlichten Rahmen.
 */
export default async function BackofficeSteuerungPage() {
  await requirePlatformAdmin();

  const organisationen = await prisma.organization.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      users: {
        where: { backofficeRolle: "manager", active: true },
        orderBy: { name: "asc" },
        select: { name: true, email: true },
      },
      featureFlags: {
        where: { key: BACKOFFICE_FEATURE_KEY },
        select: { enabled: true },
      },
      _count: { select: { backofficeAuftraege: true } },
    },
  });

  const freigeschaltet = organisationen.filter((o) => o.featureFlags[0]?.enabled).length;

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-8">
      <PageHeader
        eyebrow="Plattform"
        title="Backoffice-Steuerung"
        subtitle={`${freigeschaltet} von ${organisationen.length} Organisationen freigeschaltet. Ohne Flag sehen die Nutzer der Organisation keinen Backoffice-Menüpunkt.`}
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/anmeldungen">
                <ArrowLeft />
                Anmeldungen
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/dashboard">Zum Dashboard</Link>
            </Button>
          </>
        }
      />

      {organisationen.length === 0 ? (
        <p className="text-sm text-muted-foreground">Es gibt noch keine Organisationen.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Organisation</TableHead>
                <TableHead>Backoffice</TableHead>
                <TableHead className="text-right">Aufträge</TableHead>
                <TableHead>Manager</TableHead>
                <TableHead>Manager benennen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {organisationen.map((o) => {
                const aktiv = o.featureFlags[0]?.enabled ?? false;
                return (
                  <TableRow key={o.id}>
                    <TableCell className="align-top">
                      <div className="font-medium">{o.name}</div>
                      <div className="text-xs text-muted-foreground">{o.slug}</div>
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="flex flex-col items-start gap-2">
                        <Badge variant={aktiv ? "success" : "neutral"}>{aktiv ? "freigeschaltet" : "aus"}</Badge>
                        <BackofficeFlagForm organizationId={o.id} aktiv={aktiv} />
                      </div>
                    </TableCell>
                    <TableCell className="text-right align-top tabular">{o._count.backofficeAuftraege}</TableCell>
                    <TableCell className="align-top">
                      {o.users.length === 0 ? (
                        <span className="text-sm text-muted-foreground">noch keiner</span>
                      ) : (
                        <ul className="space-y-1 text-sm">
                          {o.users.map((u) => (
                            <li key={u.email}>
                              <span>{u.name}</span>{" "}
                              <span className="text-xs text-muted-foreground">{u.email}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </TableCell>
                    <TableCell className="align-top">
                      <BackofficeManagerForm organizationId={o.id} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Der Manager vergibt die weiteren Rollen (Bearbeiter, Prüfer) selbst im Backoffice. Der
        Nutzer muss bereits in der Organisation angelegt und aktiv sein.
      </p>
    </div>
  );
}
