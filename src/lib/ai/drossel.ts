/**
 * Drossel fuer ausgehende KI-Anfragen (Chat + OCR) je Serverinstanz.
 *
 * Hintergrund (Fall Schmidt, 06.09.2026): 14 Dateien in 7 Sekunden
 * hochgeladen. Jede Datei loest OCR, Einstufung, Extraktion, Aufteilungs- und
 * Buendelungserkennung aus - rund 70 Anfragen gegen ein Kontingent von
 * 50 Anfragen je Minute. Mistral antwortete mit HTTP 429, der Retry lief ins
 * selbe Minutenfenster, und 9 Text-PDFs blieben auf "KI-Fehler" stehen,
 * obwohl ihr Text vollstaendig vorlag.
 *
 * Zwei Grenzen, beide je Instanz (Vercel Fluid Compute teilt eine warme
 * Instanz zwischen gleichzeitigen Requests, also greift die Drossel dort
 * ueber alle Uploads eines Bursts):
 *   - maxParallel: so viele Anfragen duerfen gleichzeitig unterwegs sein.
 *   - minAbstandMs: Mindestabstand zwischen zwei Starts. 1.300 ms entsprechen
 *     rund 46 Anfragen je Minute - knapp unter dem Kontingent, damit ein
 *     Burst das Fenster nicht sprengt, sondern sich darin verteilt.
 *
 * Die Drossel ersetzt den 429-Backoff nicht, sie macht ihn selten. Ein
 * zweiter Instanz-Start wuerde die Grenze verdoppeln; fuer den Pilotbetrieb
 * ist das hinnehmbar, ein verteilter Zaehler braeuchte Upstash.
 */

export interface DrosselOptionen {
  maxParallel: number;
  minAbstandMs: number;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class KiDrossel {
  private laufend = 0;
  private wartend = 0;
  private letzterStart = 0;
  private readonly schlange: Array<() => void> = [];

  constructor(private readonly opt: DrosselOptionen) {}

  stand(): { laufend: number; wartend: number } {
    return { laufend: this.laufend, wartend: this.wartend };
  }

  /** Fuehrt `fn` aus, sobald ein Platz frei ist und der Mindestabstand vergangen ist. */
  async mit<T>(fn: () => Promise<T>): Promise<T> {
    await this.platzNehmen();
    try {
      return await fn();
    } finally {
      this.platzFreigeben();
    }
  }

  private async platzNehmen(): Promise<void> {
    if (this.laufend >= this.opt.maxParallel) {
      this.wartend++;
      await new Promise<void>((resolve) => this.schlange.push(resolve));
      this.wartend--;
    }
    this.laufend++;
    // Abstand zum letzten Start - auch fuer den, der gerade aus der Schlange kam.
    const jetzt = Date.now();
    const frei = this.letzterStart + this.opt.minAbstandMs;
    const wartezeit = frei - jetzt;
    // letzterStart SOFORT vorziehen, damit der naechste Wartende sich am
    // geplanten, nicht am vergangenen Start orientiert (sonst starten zwei
    // Wartende gleichzeitig, sobald beide die Schlange verlassen).
    this.letzterStart = wartezeit > 0 ? frei : jetzt;
    if (wartezeit > 0) await sleep(wartezeit);
  }

  private platzFreigeben(): void {
    this.laufend--;
    const naechster = this.schlange.shift();
    if (naechster) naechster();
  }
}

const STANDARD: DrosselOptionen = { maxParallel: 4, minAbstandMs: 1_300 };

function ausUmgebung(): DrosselOptionen {
  const p = Number(process.env.AI_MAX_PARALLEL);
  const a = Number(process.env.AI_MIN_ABSTAND_MS);
  return {
    maxParallel: Number.isFinite(p) && p >= 1 ? Math.floor(p) : STANDARD.maxParallel,
    minAbstandMs: Number.isFinite(a) && a >= 0 ? a : STANDARD.minAbstandMs,
  };
}

/**
 * Die eine Drossel der Instanz. Auf globalThis, damit Next.js-Hot-Reload und
 * mehrfach gebuendelte Module (Route Handler vs. Server Actions) nicht je
 * eine eigene Drossel bekommen - dann waere die Grenze nur noch Dekoration.
 */
const SCHLUESSEL = "__baufidesk_ki_drossel__";
export function kiDrossel(): KiDrossel {
  const g = globalThis as unknown as Record<string, KiDrossel | undefined>;
  if (!g[SCHLUESSEL]) g[SCHLUESSEL] = new KiDrossel(ausUmgebung());
  return g[SCHLUESSEL]!;
}
