/**
 * Wie viel des Katalogs ein Bogen zeigt.
 *
 * Abgeleitet, nicht gespeichert: Hängt der Bogen an einem Anfrageformular,
 * ist es der kurze Weg; hängt er an einem Fall, der volle. Eine gespeicherte
 * Angabe wäre ein zweiter Ort, der mit der Wirklichkeit auseinanderlaufen
 * kann.
 */
export type Umfang = "kurz" | "voll";

export function umfangDesBogens(link: { formularId: string | null }): Umfang {
  return link.formularId ? "kurz" : "voll";
}
