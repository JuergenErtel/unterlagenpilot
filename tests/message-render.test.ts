import { describe, it, expect } from "vitest";
import {
  renderTemplate,
  buildTemplateVars,
  DEFAULT_TEMPLATES,
  templateKey,
} from "@/lib/messages/render";

describe("renderTemplate", () => {
  it("ersetzt bekannte Platzhalter", () => {
    const out = renderTemplate("Hallo {{kundeName}}, Link: {{uploadLink}}", {
      kundeName: "Max",
      uploadLink: "https://x/y",
    });
    expect(out).toBe("Hallo Max, Link: https://x/y");
  });

  it("entfernt unbekannte Platzhalter (kein Kunden-sichtbarer {{tippfehler}})", () => {
    expect(renderTemplate("A {{unbekannt}} B", {})).toBe("A  B");
  });
});

describe("buildTemplateVars", () => {
  it("baut Anrede, Unterlagen-Liste und Signatur", () => {
    const vars = buildTemplateVars({
      kundeName: "Max Mustermann",
      uploadLink: "https://app/upload/abc",
      signatur: "Jürgen Ertel\nWörth",
      items: [{ title: "Grundbuchauszug" }, { title: "Eigenkapitalnachweis" }],
    });
    expect(vars.anrede).toBe("Hallo Max Mustermann,");
    expect(vars.unterlagen).toContain("• Grundbuchauszug");
    expect(vars.unterlagenNummeriert).toContain("1. [ ] Grundbuchauszug");
    expect(vars.signatur).toContain("Jürgen Ertel");
  });

  it("Anrede ohne Namen ist neutral", () => {
    const vars = buildTemplateVars({ items: [] });
    expect(vars.anrede).toBe("Hallo,");
  });
});

describe("DEFAULT_TEMPLATES", () => {
  it("hat eine Erstnachforderung-E-Mail mit den Kern-Platzhaltern", () => {
    const tpl = DEFAULT_TEMPLATES[templateKey("erstnachforderung", "email")];
    expect(tpl).toBeDefined();
    expect(tpl!.body).toContain("{{anrede}}");
    expect(tpl!.body).toContain("{{unterlagen}}");
    expect(tpl!.body).toContain("{{uploadLink}}");
    expect(tpl!.body).toContain("{{signatur}}");
    expect(tpl!.subject).toBeTruthy();
  });

  it("gerenderte Erstnachforderung enthält Kundendaten, Unterlagen und Link", () => {
    const tpl = DEFAULT_TEMPLATES[templateKey("erstnachforderung", "email")]!;
    const vars = buildTemplateVars({
      kundeName: "Max Mustermann",
      uploadLink: "https://app/upload/abc",
      signatur: "Jürgen Ertel",
      items: [{ title: "Grundbuchauszug" }],
    });
    const body = renderTemplate(tpl.body, vars);
    expect(body).toContain("Hallo Max Mustermann,");
    expect(body).toContain("• Grundbuchauszug");
    expect(body).toContain("https://app/upload/abc");
    expect(body).toContain("Jürgen Ertel");
    expect(body).not.toContain("{{");
  });
});
