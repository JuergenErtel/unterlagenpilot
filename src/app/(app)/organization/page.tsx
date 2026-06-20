import { Building2, Users, Globe, ShieldCheck } from "lucide-react";
import { requireContext } from "@/lib/auth/context";
import { prisma } from "@/lib/db";
import { type UserRole } from "@/lib/domain/enums";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";

const ROLE_LABELS: Record<UserRole, string> = {
  white_label_admin: "White-Label-Admin",
  org_admin: "Organisations-Admin",
  vermittler: "Vermittler:in",
  teammitglied: "Teammitglied",
};

const ROLE_DESCRIPTIONS: Array<{ role: UserRole; text: string }> = [
  {
    role: "org_admin",
    text: "Verwaltet die Organisation, Nutzer, Einstellungen und Tarif.",
  },
  {
    role: "vermittler",
    text: "Bearbeitet Fälle, prüft Unterlagen und gibt Auswertungen frei.",
  },
  {
    role: "teammitglied",
    text: "Unterstützt bei der Fallbearbeitung mit eingeschränkten Rechten.",
  },
  {
    role: "white_label_admin",
    text: "Verwaltet mehrere Mandanten inkl. Branding und Checklisten.",
  },
];

export default async function OrganizationPage() {
  const ctx = await requireContext();

  const [org, users] = await Promise.all([
    prisma.organization.findUnique({ where: { id: ctx.organizationId } }),
    prisma.user.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Organisation &amp; Team</h1>
        <p className="text-sm text-muted-foreground">
          Stammdaten und Nutzerverwaltung für {ctx.organizationName}.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              Organisation
            </CardTitle>
            <CardDescription>{org?.name ?? ctx.organizationName}</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[10rem_1fr] gap-y-2 text-sm">
              <dt className="text-muted-foreground">Adresse</dt>
              <dd>
                {org?.street || org?.zip || org?.city
                  ? [org?.street, [org?.zip, org?.city].filter(Boolean).join(" ")]
                      .filter(Boolean)
                      .join(", ")
                  : "–"}
              </dd>
              <dt className="text-muted-foreground">Website</dt>
              <dd>
                {org?.website ? (
                  <a
                    href={org.website}
                    className="inline-flex items-center gap-1 text-primary underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Globe className="h-3.5 w-3.5" />
                    {org.website}
                  </a>
                ) : (
                  "–"
                )}
              </dd>
              <dt className="text-muted-foreground">Aufbewahrung</dt>
              <dd>
                {org && org.retentionDays > 0
                  ? `${org.retentionDays} Tage`
                  : "Bis zur manuellen Löschung (0)"}
              </dd>
              <dt className="text-muted-foreground">White Label</dt>
              <dd>
                {org?.isWhiteLabel ? (
                  <Badge variant="secondary">Aktiv</Badge>
                ) : (
                  <Badge variant="outline">Inaktiv</Badge>
                )}
              </dd>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-muted-foreground" />
              Rollen
            </CardTitle>
            <CardDescription>
              Rechtemodell (RBAC) der Organisation.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              {ROLE_DESCRIPTIONS.map((r) => (
                <div key={r.role} className="grid grid-cols-[12rem_1fr] gap-2">
                  <dt>
                    <Badge variant="outline">{ROLE_LABELS[r.role]}</Badge>
                  </dt>
                  <dd className="text-muted-foreground">{r.text}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-muted-foreground" />
            Team
          </CardTitle>
          <CardDescription>
            {users.length} {users.length === 1 ? "Nutzer" : "Nutzer"} in dieser
            Organisation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>E-Mail</TableHead>
                <TableHead>Rolle</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {u.email}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {ROLE_LABELS[u.role as UserRole] ?? u.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {u.active ? (
                      <Badge variant="success">Aktiv</Badge>
                    ) : (
                      <Badge variant="secondary">Inaktiv</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {users.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground">
                    Noch keine Nutzer angelegt.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
