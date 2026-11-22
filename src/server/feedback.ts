// Player feedback: bug reports and ideas from the "Feedback" button.
// The server adds each report to a Notion database. When Notion is not set up or does not
// answer, the report goes to the server log instead, without the email address.

export type FeedbackType = "bug" | "idea" | "other";
export type FeedbackPage = "home" | "game" | "info";

export interface FeedbackReport {
  type: FeedbackType;
  message: string;
  /** Optional. Only when the player wants an answer. */
  email: string | null;
  page: FeedbackPage;
  /** A short summary such as "Chrome on Android". Never the full user agent. */
  browser: string;
  version: string;
}

/** Sends one report. It never throws: a failure goes to the server log. */
export type FeedbackSender = (report: FeedbackReport) => Promise<void>;

const TYPE_NAMES: Record<FeedbackType, string> = { bug: "Bug", idea: "Idea", other: "Other" };
const PAGE_NAMES: Record<FeedbackPage, string> = { home: "Home", game: "Game", info: "Info page" };
const NOTION_VERSION = "2022-06-28";
const NOTION_TIMEOUT_MS = 8_000;

/** Writes a report to the server log. The email stays out of the log. */
export function logFeedback(report: FeedbackReport, why: string): void {
  console.warn(
    JSON.stringify({
      t: new Date().toISOString(),
      kind: "feedback",
      why,
      type: report.type,
      page: report.page,
      version: report.version,
      browser: report.browser,
      hasEmail: report.email !== null,
      message: report.message,
    }),
  );
}

/** The title of the Notion page: the first line of the message, at most 80 characters. */
export function feedbackSummary(message: string): string {
  const first = message.split("\n")[0].trim();
  return first.length > 80 ? `${first.slice(0, 79)}…` : first;
}

export function notionFeedbackSender(token: string, databaseId: string, fetchImpl: typeof fetch = fetch): FeedbackSender {
  return async (report) => {
    const text = (content: string) => [{ type: "text", text: { content } }];
    const body = {
      parent: { database_id: databaseId },
      properties: {
        Summary: { title: text(feedbackSummary(report.message)) },
        Type: { select: { name: TYPE_NAMES[report.type] } },
        Message: { rich_text: text(report.message) },
        Email: { email: report.email },
        From: { select: { name: "Player report" } },
        Version: { select: { name: report.version } },
        Page: { select: { name: PAGE_NAMES[report.page] } },
        Browser: { rich_text: text(report.browser) },
      },
    };
    try {
      const res = await fetchImpl("https://api.notion.com/v1/pages", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Notion-Version": NOTION_VERSION,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(NOTION_TIMEOUT_MS),
      });
      if (!res.ok) logFeedback(report, `notion_${res.status}`);
    } catch {
      logFeedback(report, "notion_unreachable");
    }
  };
}

/**
 * Checks once at start-up that the key can open the database. A failure writes a clear error
 * to the log, because the players still see "Thank you" and the reports then go only to the log.
 */
export async function checkFeedbackSetup(env: Record<string, string | undefined>, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const token = env.NOTION_FEEDBACK_TOKEN?.trim();
  const databaseId = env.NOTION_FEEDBACK_DATABASE_ID?.trim();
  if (!token || !databaseId) {
    console.error("FEEDBACK NOT SET UP: NOTION_FEEDBACK_TOKEN or NOTION_FEEDBACK_DATABASE_ID is missing. Reports go only to this log.");
    return false;
  }
  try {
    const res = await fetchImpl(`https://api.notion.com/v1/databases/${databaseId}`, {
      headers: { Authorization: `Bearer ${token}`, "Notion-Version": NOTION_VERSION },
      signal: AbortSignal.timeout(NOTION_TIMEOUT_MS),
    });
    if (res.ok) return true;
    console.error(
      `FEEDBACK NOT WORKING: Notion answered ${res.status}. Check the key, and share the database with the integration. Reports go only to this log.`,
    );
  } catch {
    console.error("FEEDBACK NOT WORKING: Notion did not answer. Reports go only to this log until it does.");
  }
  return false;
}

/** Uses NOTION_FEEDBACK_TOKEN and NOTION_FEEDBACK_DATABASE_ID. Without them, reports go to the server log. */
export function feedbackSenderFromEnv(env: Record<string, string | undefined>): FeedbackSender {
  const token = env.NOTION_FEEDBACK_TOKEN?.trim();
  const databaseId = env.NOTION_FEEDBACK_DATABASE_ID?.trim();
  if (!token || !databaseId) return async (report) => logFeedback(report, "notion_not_configured");
  return notionFeedbackSender(token, databaseId);
}

/** "Firefox on Windows", "Safari on iPhone". Unknown parts become "Other". */
export function browserSummary(userAgent: string | undefined): string {
  const ua = userAgent ?? "";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /SamsungBrowser/.test(ua)
        ? "Samsung Internet"
        : /Firefox\/|FxiOS/.test(ua)
          ? "Firefox"
          : /Chrome\/|CriOS/.test(ua)
            ? "Chrome"
            : /Safari\//.test(ua)
              ? "Safari"
              : "Other browser";
  const system = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Windows/.test(ua)
          ? "Windows"
          : /Mac OS X|Macintosh/.test(ua)
            ? "Mac"
            : /Linux/.test(ua)
              ? "Linux"
              : "other system";
  return `${browser} on ${system}`;
}
