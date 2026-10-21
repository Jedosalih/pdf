import nodemailer, { type Transporter } from "nodemailer";

/**
 * Plain SMTP delivery (no transactional-email API provider): any mailbox
 * or mail server reachable over SMTP works. Configuration (see
 * .env.example):
 *
 *   SMTP_HOST, SMTP_PORT, SMTP_TLS_MODE (starttls | tls | none),
 *   SMTP_USER, SMTP_PASSWORD, EMAIL_FROM
 *
 * `starttls` (port 587) requires the upgrade -- a server that doesn't
 * offer it is refused, not silently used in plaintext. `tls` is implicit
 * TLS (port 465). `none` is refused when NODE_ENV=production; it exists for
 * the local Mailpit capture server in docker-compose.yml, which is also
 * the default when SMTP_HOST is unset outside production. Certificates are
 * always verified.
 */
export class EmailUnavailableError extends Error {
  constructor(reason: string) {
    super(`Email delivery is not available: ${reason}`);
  }
}

type TlsMode = "starttls" | "tls" | "none";

interface SmtpConfig {
  host: string;
  port: number;
  tlsMode: TlsMode;
  user?: string;
  password?: string;
  from: string;
}

const isProduction = () => process.env.NODE_ENV === "production";

function readConfig(): SmtpConfig {
  const host = process.env.SMTP_HOST || (isProduction() ? "" : "localhost");
  if (!host) throw new EmailUnavailableError("SMTP_HOST is not set");

  const tlsMode = (process.env.SMTP_TLS_MODE || (process.env.SMTP_HOST ? "starttls" : "none")) as TlsMode;
  if (!["starttls", "tls", "none"].includes(tlsMode)) {
    throw new EmailUnavailableError("SMTP_TLS_MODE must be starttls, tls or none");
  }
  if (tlsMode === "none" && isProduction()) {
    throw new EmailUnavailableError("SMTP_TLS_MODE=none is not allowed in production");
  }

  const defaultPort = tlsMode === "tls" ? 465 : tlsMode === "starttls" ? 587 : 1025;
  const port = Number.parseInt(process.env.SMTP_PORT ?? "", 10) || defaultPort;
  const from = process.env.EMAIL_FROM || (isProduction() ? "" : "JPdf <no-reply@localhost>");
  if (!from) throw new EmailUnavailableError("EMAIL_FROM is not set");

  return {
    host,
    port,
    tlsMode,
    user: process.env.SMTP_USER || undefined,
    password: process.env.SMTP_PASSWORD || undefined,
    from,
  };
}

/** Throws EmailUnavailableError if email can't be sent in this
 * environment -- lets routes fail honestly before doing any work. */
export function assertEmailConfigured(): void {
  readConfig();
}

let cached: { key: string; transporter: Transporter } | undefined;

function transporterFor(config: SmtpConfig): Transporter {
  const key = `${config.host}:${config.port}:${config.tlsMode}:${config.user ?? ""}`;
  if (cached?.key === key) return cached.transporter;
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.tlsMode === "tls",
    requireTLS: config.tlsMode === "starttls",
    ignoreTLS: config.tlsMode === "none",
    auth: config.user ? { user: config.user, pass: config.password ?? "" } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
  });
  cached = { key, transporter };
  return transporter;
}

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export async function sendEmail(message: OutgoingEmail): Promise<void> {
  const config = readConfig();
  await transporterFor(config).sendMail({ from: config.from, ...message });
}
