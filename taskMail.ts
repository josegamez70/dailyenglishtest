import { timingSafeEqual } from 'node:crypto';
import tls from 'node:tls';
import { taskReminderMessage, type TaskEmailInput, type TaskFrequency } from './tasks.ts';

/**
 * Reminder mail is sent only when every required variable is set.
 * Missing variables skip the email. They do not throw.
 *
 * TASK_SMTP_HOST       smtp.buzondecorreo.com
 * TASK_SMTP_PORT       optional, default 465 (SSL)
 * TASK_SMTP_USER       mailbox login, info@dailyenglishtest.es
 * TASK_SMTP_PASSWORD   mailbox password
 * TASK_SMTP_FROM       optional, defaults to TASK_SMTP_USER
 * APP_BASE_URL         https://dailyenglishtest.es — links in the email
 */
export type SmtpSettings = {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
};

export type EnvMap = Record<string, string | undefined>;

export function readEnvValue(env: EnvMap, name: string): string {
  const direct = env[name]?.trim() ?? '';
  if (direct) return direct;
  const netlify = (globalThis as { Netlify?: { env?: { get?: (key: string) => string | undefined } } }).Netlify;
  return netlify?.env?.get?.(name)?.trim() ?? '';
}

export function runtimeEnv(): EnvMap {
  return process.env;
}

export function readSmtpSettings(env: EnvMap): SmtpSettings | null {
  const host = readEnvValue(env, 'TASK_SMTP_HOST');
  const user = readEnvValue(env, 'TASK_SMTP_USER');
  const password = readEnvValue(env, 'TASK_SMTP_PASSWORD');
  if (!host || !user || !password) return null;
  const portRaw = readEnvValue(env, 'TASK_SMTP_PORT') || '465';
  const port = Number(portRaw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  const from = readEnvValue(env, 'TASK_SMTP_FROM') || user;
  if (!from.includes('@')) return null;
  return { host, port, user, password, from };
}

export function secretMatches(header: string | null | undefined, env: EnvMap): boolean {
  const expected = readEnvValue(env, 'TASKS_JOB_SECRET');
  const got = header?.trim() ?? '';
  if (!expected || !got) return false;
  const left = Buffer.from(got);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function appBaseUrl(env: EnvMap): string | null {
  const raw = readEnvValue(env, 'APP_BASE_URL').replace(/\/+$/, '');
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') return null;
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** Dot-stuffed SMTP data. No credentials are included. */
export function buildMimeMessage(input: {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}): string {
  const boundary = 'det-task-boundary';
  const encode = (value: string) => Buffer.from(value, 'utf8').toString('base64').replace(/.{1,76}/g, '$&\r\n').trim();
  const lines = [
    `From: ${input.from}`,
    `To: ${input.to}`,
    `Subject: ${input.subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    encode(input.text),
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    encode(input.html),
    `--${boundary}--`,
    '',
  ];
  return lines.join('\r\n').replace(/^\./gm, '..');
}

function codeOf(reply: string): number {
  const lines = reply.split(/\r?\n/).filter(Boolean);
  const last = lines[lines.length - 1] ?? '';
  const match = last.match(/^(\d{3}) /);
  return match ? Number(match[1]) : 0;
}

class SmtpSession {
  private buffer = '';
  private pending: { resolve: (reply: string) => void; reject: (error: Error) => void } | null = null;
  private failed: Error | null = null;
  private socket: tls.TLSSocket;

  constructor(socket: tls.TLSSocket) {
    this.socket = socket;
    socket.on('data', (chunk: Buffer) => {
      this.buffer += chunk.toString('utf8');
      this.pump();
    });
    socket.on('error', (error: Error) => {
      this.failed = error;
      this.pending?.reject(error);
      this.pending = null;
    });
  }

  private pump() {
    if (!this.pending) return;
    const lines = this.buffer.split(/\r?\n/);
    const complete = this.buffer.endsWith('\n');
    const usable = complete ? lines.slice(0, -1) : lines.slice(0, -1);
    const last = usable[usable.length - 1] ?? '';
    if (!/^\d{3} /.test(last)) return;
    const reply = usable.join('\r\n');
    this.buffer = complete ? '' : lines[lines.length - 1] ?? '';
    const waiter = this.pending;
    this.pending = null;
    waiter.resolve(reply);
  }

  send(line: string): Promise<string> {
    if (this.failed) return Promise.reject(this.failed);
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject };
      this.pump();
      if (this.pending && line) this.socket.write(`${line}\r\n`);
    });
  }

  end() {
    this.socket.end();
  }
}

export async function sendSmtpMail(settings: SmtpSettings, input: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  const socket = tls.connect({ host: settings.host, port: settings.port, servername: settings.host });
  await new Promise<void>((resolve, reject) => {
    socket.once('secureConnect', () => resolve());
    socket.once('error', reject);
  });
  const smtp = new SmtpSession(socket);
  try {
    const greet = await smtp.send('');
    if (codeOf(greet) !== 220) throw new Error('smtp_greeting');
    const ehlo = await smtp.send('EHLO dailyenglishtest.es');
    if (codeOf(ehlo) !== 250) throw new Error('smtp_ehlo');
    const user = Buffer.from(settings.user, 'utf8').toString('base64');
    const pass = Buffer.from(settings.password, 'utf8').toString('base64');
    const auth = await smtp.send('AUTH LOGIN');
    if (codeOf(auth) !== 334) throw new Error('smtp_auth');
    const userReply = await smtp.send(user);
    if (codeOf(userReply) !== 334) throw new Error('smtp_user');
    const passReply = await smtp.send(pass);
    if (codeOf(passReply) !== 235) throw new Error('smtp_password');
    const from = await smtp.send(`MAIL FROM:<${settings.from}>`);
    if (codeOf(from) !== 250) throw new Error('smtp_from');
    const to = await smtp.send(`RCPT TO:<${input.to}>`);
    if (codeOf(to) !== 250 && codeOf(to) !== 251) throw new Error('smtp_to');
    const data = await smtp.send('DATA');
    if (codeOf(data) !== 354) throw new Error('smtp_data');
    const body = buildMimeMessage({
      from: settings.from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
    const sent = await smtp.send(`${body}\r\n.`);
    if (codeOf(sent) !== 250) throw new Error('smtp_send');
    await smtp.send('QUIT').catch(() => undefined);
  } finally {
    smtp.end();
  }
}

export type MailResult = { sent: true } | { sent: false; reason: 'not_configured' | 'no_address' | 'send_failed' };

export async function sendTaskReminder(env: EnvMap, input: {
  to: string;
  token: string;
  frequency: TaskFrequency;
  periodKey: string;
  packCount?: number;
}): Promise<MailResult> {
  const settings = readSmtpSettings(env);
  const baseUrl = appBaseUrl(env);
  const to = input.to.trim();
  if (!settings || !baseUrl) return { sent: false, reason: 'not_configured' };
  if (!to.includes('@')) return { sent: false, reason: 'no_address' };
  const message: TaskEmailInput = {
    baseUrl,
    token: input.token,
    frequency: input.frequency,
    periodKey: input.periodKey,
    packCount: input.packCount,
  };
  const mail = taskReminderMessage(message);
  try {
    await sendSmtpMail(settings, { to, subject: mail.subject, html: mail.html, text: mail.text });
    return { sent: true };
  } catch (error) {
    console.error('task reminder email failed', error instanceof Error ? error.message : 'send_failed');
    return { sent: false, reason: 'send_failed' };
  }
}
