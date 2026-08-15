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

/**
 * Der Stichtag, ab dem die gefuehrte Kontaktaufnahme gilt (`KONTAKT_START_AB`).
 *
 * Bewusst getrennt von `kontaktEinstellungen`: Der Stichtag geht die Rechnung
 * in `kontaktStand` nichts an – er entscheidet eine Stufe FRUEHER, ob ein Fall
 * ueberhaupt einen Kontaktstand bekommt.
 */
export function kontaktStartAb(): Date {
  return getEnv().KONTAKT_START_AB;
}

/**
 * Gilt die gefuehrte Kontaktaufnahme fuer diesen Fall?
 *
 * Faelle, die VOR dem Stichtag angelegt wurden, bekommen von den Aufrufern
 * `kontakt: undefined` durchgereicht und verhalten sich damit exakt wie vor
 * der Einfuehrung. Der Grund: Bis dahin konnte kein Vermerk ein `ergebnis`
 * tragen – kein Bestandsfall hat also einen "erreicht"-Vermerk, und
 * `kontaktStand` haette fuer alle `faellig: true` und (weil der Leadeingang
 * lange her ist) `abbruchFaellig: true` geliefert. Am Tag des Deploys stuende
 * dann ueber einem einreichungsfertigen Fall aus dem Juli "Kunden anrufen –
 * Der Lead ist frisch", und alles darunter waere verdeckt.
 *
 * `startAb` kommt als Parameter herein, damit der Aufrufer ihn EINMAL je
 * Aufruf bildet – dieselbe Regel wie bei `jetzt`.
 */
export function giltKontaktaufnahmeFuer(fallAngelegtAm: Date, startAb: Date): boolean {
  return fallAngelegtAm.getTime() >= startAb.getTime();
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
