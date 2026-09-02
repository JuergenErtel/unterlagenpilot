"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { BEREICH_PRODUKT, bereichAusPfad, verfuegbareBereiche, type Bereiche } from "@/lib/backoffice/bereich";

/**
 * Produktname in der Kopfzeile. Erscheint nur, wenn der Nutzer mehr als
 * einen Bereich hat - sonst gibt es nichts zu unterscheiden, und die
 * Kopfzeile bleibt so leer wie bisher.
 */
export function BereichKopf({ bereiche }: { bereiche?: Bereiche }) {
  const pathname = usePathname();
  if (!bereiche || verfuegbareBereiche(bereiche).length < 2) return null;
  const roh = bereichAusPfad(pathname);
  const bereich = bereiche[roh] ? roh : "vertrieb";
  return (
    <span
      className={cn(
        "display truncate text-[0.8125rem] tracking-normal",
        bereich === "vertrieb" ? "text-muted-foreground" : "text-foreground"
      )}
    >
      {BEREICH_PRODUKT[bereich]}
    </span>
  );
}
