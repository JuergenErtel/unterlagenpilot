import Link from "next/link";

/**
 * Die Rechtslinks unter den öffentlichen Einstiegsseiten (Gate, Login,
 * Anfrage). Das Impressum muss von jeder Seite aus "leicht erkennbar,
 * unmittelbar erreichbar" sein (§ 5 DDG) – und das Gate ist, solange es
 * steht, DIE öffentliche Seite dieser Domain. Die Rechtsseiten selbst sind
 * vom Site-Gate ausgenommen (src/middleware.ts), die Links laufen also nie
 * gegen die Passwortabfrage.
 */
export function RechtsFooter() {
  return (
    <p className="text-center text-xs text-muted-foreground">
      <Link href="/impressum" className="hover:underline">
        Impressum
      </Link>
      {" · "}
      <Link href="/datenschutz" className="hover:underline">
        Datenschutz
      </Link>
      {" · "}
      <Link href="/agb" className="hover:underline">
        AGB
      </Link>
    </p>
  );
}
