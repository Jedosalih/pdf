import { expect } from "@playwright/test";

/**
 * Reads mail captured by the local Mailpit SMTP server (docker-compose.yml)
 * -- the real SMTP path the app uses in production, delivered to a capture
 * server instead of a mailbox.
 */
const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://localhost:8025";

export interface CapturedEmail {
  id: string;
  subject: string;
  text: string;
  html: string;
}

interface SearchResponse {
  messages: { ID: string; Subject: string; To: { Address: string }[] }[];
}

async function search(to: string): Promise<SearchResponse["messages"]> {
  const response = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
  if (!response.ok) throw new Error(`Mailpit search failed: ${response.status}`);
  return ((await response.json()) as SearchResponse).messages;
}

export async function countEmails(to: string): Promise<number> {
  return (await search(to)).length;
}

/** Newest message to `to` whose subject contains `subjectIncludes`. */
export async function waitForEmail(to: string, subjectIncludes: string, minCount = 1): Promise<CapturedEmail> {
  let id: string | undefined;
  await expect
    .poll(
      async () => {
        const matches = (await search(to)).filter((m) => m.Subject.includes(subjectIncludes));
        id = matches.length >= minCount ? matches[0]?.ID : undefined;
        return Boolean(id);
      },
      { timeout: 20_000, intervals: [250, 500, 1000] },
    )
    .toBe(true);
  const response = await fetch(`${MAILPIT_URL}/api/v1/message/${id}`);
  const message = (await response.json()) as { ID: string; Subject: string; Text: string; HTML: string };
  return { id: message.ID, subject: message.Subject, text: message.Text, html: message.HTML };
}

/** The app link in an email, as a same-origin path (`/en/verify-email?token=...`). */
export function linkPath(email: CapturedEmail, pathPart: string): string {
  const match = new RegExp(`https?://\\S*${pathPart}\\S*`).exec(email.text);
  if (!match) throw new Error(`No ${pathPart} link in email "${email.subject}"`);
  const url = new URL(match[0]);
  return `${url.pathname}${url.search}`;
}

export function tokenFrom(path: string): string {
  return new URL(path, "http://x").searchParams.get("token") ?? "";
}
