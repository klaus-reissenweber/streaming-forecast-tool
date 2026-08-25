import { describe, expect, it } from "vitest";
import {
  applyNotesPatch,
  compactAdReportNotes,
  dismissedFindings,
  hasUsableBudget,
  notesToJson,
  parseAdReportNotes,
  resolveFindings,
  visibleFindings,
} from "./notes";

describe("hasUsableBudget", () => {
  it("is false when missing, zero, or non-finite", () => {
    expect(hasUsableBudget(undefined)).toBe(false);
    expect(hasUsableBudget(null)).toBe(false);
    expect(hasUsableBudget(0)).toBe(false);
    expect(hasUsableBudget(Number.NaN)).toBe(false);
  });

  it("is true when planned budget is positive", () => {
    expect(hasUsableBudget(2000)).toBe(true);
  });
});

describe("parseAdReportNotes", () => {
  it("returns empty for null, arrays, and non-objects", () => {
    expect(parseAdReportNotes(null)).toEqual({});
    expect(parseAdReportNotes([])).toEqual({});
    expect(parseAdReportNotes("creative")).toEqual({});
  });

  it("keeps the three free-text keys and finding overrides", () => {
    const notes = parseAdReportNotes({
      creative: "Cut 15s",
      audience: "  ",
      recommendations: "Raise Showcase",
      findings: {
        Streams: { text: "Rewritten.", state: "edited" },
        "cps-gap": { text: "", state: "dismissed" },
        skip: { text: "nope" },
      },
      extra: "ignored",
    });
    expect(notes.creative).toBe("Cut 15s");
    expect(notes.audience).toBeUndefined();
    expect(notes.recommendations).toBe("Raise Showcase");
    expect(notes.findings).toEqual({
      Streams: { text: "Rewritten.", state: "edited" },
      "cps-gap": { text: "", state: "dismissed" },
    });
  });
});

describe("applyNotesPatch", () => {
  it("stores and clears free-text sections", () => {
    const withCreative = applyNotesPatch({}, {
      kind: "section",
      key: "creative",
      value: "Line one\nLine two",
    });
    expect(withCreative.creative).toBe("Line one\nLine two");
    const cleared = applyNotesPatch(withCreative, {
      kind: "section",
      key: "creative",
      value: "  \n  ",
    });
    expect(cleared.creative).toBeUndefined();
    expect(notesToJson(cleared)).toBeNull();
  });

  it("edits, dismisses, and reverts findings without orphaning", () => {
    const edited = applyNotesPatch({}, {
      kind: "finding",
      id: "Streams",
      override: { text: "Edited sentence.", state: "edited" },
    });
    expect(edited.findings?.Streams).toEqual({
      text: "Edited sentence.",
      state: "edited",
    });

    const dismissed = applyNotesPatch(edited, {
      kind: "finding",
      id: "Streams",
      override: { text: "Edited sentence.", state: "dismissed" },
    });
    expect(dismissed.findings?.Streams.state).toBe("dismissed");

    const reverted = applyNotesPatch(dismissed, {
      kind: "finding",
      id: "Streams",
      override: null,
    });
    expect(reverted.findings).toBeUndefined();
    expect(notesToJson(reverted)).toBeNull();
  });
});

describe("resolveFindings", () => {
  const generated = [
    { id: "Streams", text: "Streams landed inside the expected range." },
    { id: "cps-gap", text: "Showcase cost less per stream than Meta." },
  ];

  it("uses generated text when there is no override", () => {
    const resolved = resolveFindings(generated, {});
    expect(resolved.map((f) => f.state)).toEqual(["generated", "generated"]);
    expect(visibleFindings(resolved)).toHaveLength(2);
  });

  it("replaces text for edited ids and hides dismissed", () => {
    const resolved = resolveFindings(generated, {
      findings: {
        Streams: { text: "Rewritten.", state: "edited" },
        "cps-gap": { text: "", state: "dismissed" },
      },
    });
    expect(resolved[0]).toMatchObject({
      state: "edited",
      text: "Rewritten.",
      generatedText: "Streams landed inside the expected range.",
    });
    expect(visibleFindings(resolved).map((f) => f.id)).toEqual(["Streams"]);
    expect(dismissedFindings(resolved).map((f) => f.id)).toEqual(["cps-gap"]);
  });

  it("ignores overrides whose ids are no longer generated", () => {
    const resolved = resolveFindings(generated, {
      findings: {
        ghost: { text: "Orphan sentence.", state: "edited" },
      },
    });
    expect(resolved.map((f) => f.id)).toEqual(["Streams", "cps-gap"]);
    expect(resolved.every((f) => f.state === "generated")).toBe(true);
    expect(compactAdReportNotes({
      findings: { ghost: { text: "Orphan sentence.", state: "edited" } },
    }).findings?.ghost).toBeDefined();
  });
});
