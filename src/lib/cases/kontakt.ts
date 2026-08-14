import { getEnv } from "@/lib/env";

/**
 * Der Stand der telefonischen Kontaktaufnahme – abgeleitet, nie gespeichert.
 *
 * Kontaktversuche sind Vermerke (`CaseNote`) mit einem Ergebnis. Alles, was
 * die Leiter darüber wissen muss, ist eine Rechnung auf dieser Liste. Damit
 * kann kein Zustand auseinanderlaufen, und es braucht keinen Cron: Fälligkeit
 * entsteht durch Zeitablauf, nicht durch ein Ereignis, das jemand verpassen
 * könnte.
 *
 * `jetzt` wird übergeben und nie gemessen – sonst wären die Grenzfälle
 * (Abstand gerade abgelaufen, Frist gerade erreicht) nicht prüfbar.
 */
export interface Kontaktversuch {
  ergebnis: "erreicht" | "nicht_erreicht";
  createdAt: Date;
}

export interface KontaktEinstellungen {
  /** Abstand zwischen zwei Anrufversuchen. */
  abstandStunden: number;
  /** Frist ab Leadeingang, nach der ohne Kontakt der Abbruch vorgeschlagen wird. */
  fristTage: number;
}

export interface KontaktStand {
  /** Wurde der Kunde je erreicht? Beendet die Strecke. */
  jeErreicht: boolean;
  /** Anzahl der erfolglosen Versuche. */
  versuche: number;
  letzterVersuchAm: Date | null;
  /** Ab wann der nächste Versuch fällig ist; null heißt: sofort. */
  naechsterAb: Date | null;
  /** Ist jetzt ein Versuch fällig? */
  faellig: boolean;
  /** Ist die Frist ohne Kontakt verstrichen? */
  abbruchFaellig: boolean;
  /**
   * Die eingestellte Frist in Tagen, aus der `abbruchFaellig` folgt – wird
   * mitgegeben, damit Texte (z. B. in der Prioritätsleiter) sie nennen
   * können, statt eine feste Zahl hart zu codieren, während
   * `KONTAKT_FRIST_TAGE` woanders eingestellt wird.
   */
  fristTage: number;
}

export function kontaktEinstellungen(): KontaktEinstellungen {
  const env = getEnv();
  return { abstandStunden: env.KONTAKT_ABSTAND_STUNDEN, fristTage: env.KONTAKT_FRIST_TAGE };
}

export function kontaktStand(
  versuche: Kontaktversuch[],
  leadEingangAm: Date,
  jetzt: Date,
  einstellungen: KontaktEinstellungen
): KontaktStand {
  const jeErreicht = versuche.some((v) => v.ergebnis === "erreicht");
  const erfolglos = versuche.filter((v) => v.ergebnis === "nicht_erreicht");

  const letzterVersuchAm = versuche.reduce<Date | null>(
    (spaetester, v) => (!spaetester || v.createdAt > spaetester ? v.createdAt : spaetester),
    null
  );
  const naechsterAb = letzterVersuchAm
    ? new Date(letzterVersuchAm.getTime() + einstellungen.abstandStunden * 3600_000)
    : null;

  const fristEndeAm = new Date(leadEingangAm.getTime() + einstellungen.fristTage * 86_400_000);

  return {
    jeErreicht,
    versuche: erfolglos.length,
    letzterVersuchAm,
    naechsterAb,
    faellig: !jeErreicht && (naechsterAb === null || jetzt >= naechsterAb),
    // "erreicht" gewinnt immer: Ein Fall, der läuft, darf nie zum Abschuss
    // freigegeben werden, nur weil der Leadeingang lange her ist.
    abbruchFaellig: !jeErreicht && jetzt >= fristEndeAm,
    fristTage: einstellungen.fristTage,
  };
}
