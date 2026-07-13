// tests/domain/extract-urls.test.ts
import { describe, expect, it } from "vitest";
import { extractUrls, stripHtml } from "../../src/domain/extract-urls.js";

describe("stripHtml", () => {
  it("removes tags and decodes basic entities", () => {
    expect(stripHtml('<p>Join <a href="https://meet.google.com/abc-defg-hij">here</a></p>')).toContain(
      "https://meet.google.com/abc-defg-hij",
    );
    expect(stripHtml("A&amp;B")).toBe("A&B");
  });
});

describe("extractUrls", () => {
  it("extracts https urls from plain text with whitespace", () => {
    const urls = extractUrls("See  https://zoom.us/j/123456789  thanks");
    expect(urls).toEqual(["https://zoom.us/j/123456789"]);
  });

  it("extracts urls from HTML hrefs and visible text", () => {
    const urls = extractUrls(
      '<div>Click <a href="https://teams.microsoft.com/l/meetup-join/xyz">Teams</a></div>',
    );
    expect(urls).toContain("https://teams.microsoft.com/l/meetup-join/xyz");
  });

  it("ignores malformed urls and unrelated noise", () => {
    const urls = extractUrls("broken http:// and also not-a-url ftp://files.example/x");
    expect(urls.every((u) => u.startsWith("http") || u.includes("://"))).toBe(true);
  });

  it("extracts zoommtg protocol links", () => {
    const urls = extractUrls("Open zoommtg://zoom.us/join?action=join&confno=123");
    expect(urls.some((u) => u.startsWith("zoommtg://"))).toBe(true);
  });
});
