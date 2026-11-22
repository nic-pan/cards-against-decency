import { afterEach, describe, expect, it, vi } from "vitest";
import { browserSummary, checkFeedbackSetup, feedbackSummary, notionFeedbackSender, type FeedbackReport } from "./feedback";

const report: FeedbackReport = {
  type: "idea",
  message: "Add a chat.\nIt would be fun.",
  email: null,
  page: "home",
  browser: "Firefox on Mac",
  version: "1",
};

afterEach(() => vi.restoreAllMocks());

describe("feedback", () => {
  it("names the browser and the system, never the full user agent", () => {
    expect(browserSummary("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1")).toBe(
      "Safari on iPhone",
    );
    expect(browserSummary("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36")).toBe("Chrome on Android");
    expect(browserSummary("Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120.0 Safari/537.36 Edg/120.0")).toBe("Edge on Windows");
    expect(browserSummary(undefined)).toBe("Other browser on other system");
  });

  it("uses the first line, at most 80 characters, as the title", () => {
    expect(feedbackSummary("Add a chat.\nIt would be fun.")).toBe("Add a chat.");
    expect(feedbackSummary("x".repeat(100))).toHaveLength(80);
  });

  it("creates a page in the Notion database", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    await notionFeedbackSender("secret", "db123", fetchImpl as unknown as typeof fetch)(report);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.notion.com/v1/pages");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret");
    const body = JSON.parse(init.body as string);
    expect(body.parent).toEqual({ database_id: "db123" });
    expect(body.properties.Type.select.name).toBe("Idea");
    expect(body.properties.From.select.name).toBe("Player report");
    expect(body.properties.Summary.title[0].text.content).toBe("Add a chat.");
  });

  it("writes the report to the log, without the email, when Notion fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 401 }));
    await notionFeedbackSender("bad", "db123", fetchImpl as unknown as typeof fetch)({ ...report, email: "a@b.co" });
    const line = JSON.parse(warn.mock.calls[0][0] as string);
    expect(line).toMatchObject({ kind: "feedback", why: "notion_401", message: report.message, hasEmail: true });
    expect(JSON.stringify(line)).not.toContain("a@b.co");
  });

  it("reports a missing or broken setup at start-up", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await checkFeedbackSetup({})).toBe(false);
    expect(error.mock.calls[0][0]).toContain("FEEDBACK NOT SET UP");
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 404 }));
    expect(
      await checkFeedbackSetup(
        { NOTION_FEEDBACK_TOKEN: "t", NOTION_FEEDBACK_DATABASE_ID: "d" },
        fetchImpl as unknown as typeof fetch,
      ),
    ).toBe(false);
    expect(error.mock.calls[1][0]).toContain("FEEDBACK NOT WORKING: Notion answered 404");
  });
});
