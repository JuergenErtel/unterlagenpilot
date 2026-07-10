import { prisma } from "@/lib/db";
import { getDummyPasswordHash, verifyPassword } from "@/lib/auth/session";
import type { UserRole } from "@/lib/domain/enums";

/**
 * Provider-neutrale Auth-Abstraktion.
 *
 * Aktueller Default: CredentialsAuthProvider (E-Mail + Passwort, scrypt-Hash in
 * der eigenen DB). Bewusst dependency-frei und EU-/serverless-tauglich.
 *
 * Austauschbar – ohne den restlichen Code zu ändern – durch:
 *  - NextAuthProvider (z. B. mit OAuth/Magic-Link)
 *  - SupabaseAuthProvider (Supabase Auth, JWT-Verifikation)
 *  - eigener IdP via OIDC
 * Die Entscheidung ist in der README dokumentiert.
 */
export interface AuthenticatedUser {
  id: string;
  organizationId: string;
  name: string;
  role: UserRole;
}

export interface AuthProvider {
  readonly name: string;
  /** Prüft Anmeldedaten. Gibt null zurück, wenn ungültig (keine Detail-Leaks). */
  authenticate(email: string, password: string): Promise<AuthenticatedUser | null>;
}

class CredentialsAuthProvider implements AuthProvider {
  readonly name = "credentials";

  async authenticate(email: string, password: string): Promise<AuthenticatedUser | null> {
    const normalized = email.trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email: normalized } });
    // Konstante-Zeit-ähnliches Verhalten: auch ohne Treffer (oder ohne gesetztes
    // Passwort) eine Hash-Prüfung ausführen, damit „User existiert nicht" nicht
    // über Timing erkennbar ist. Passwortlose Konten (z. B. per Einladung
    // angelegt) können sich niemals per Credentials anmelden.
    // Die Hash-Prüfung läuft IMMER (auch ohne Treffer), erst danach die
    // Bedingungen – sonst verriete die Antwortzeit, ob das Konto existiert.
    const ok = verifyPassword(password, user?.passwordHash || getDummyPasswordHash());
    if (!user || !user.active || !user.passwordHash || !ok) return null;
    return {
      id: user.id,
      organizationId: user.organizationId,
      name: user.name,
      role: user.role as UserRole,
    };
  }
}

let provider: AuthProvider | null = null;

export function getAuthProvider(): AuthProvider {
  if (provider) return provider;
  // TODO(prod): hier optional NextAuth/Supabase-Provider per ENV auswählen.
  provider = new CredentialsAuthProvider();
  return provider;
}
