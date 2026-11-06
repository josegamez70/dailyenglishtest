import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import { isAndroidUserAgent } from './device';
import { buildProgressReport, type ProgressReport, type RecentLine } from './progressReport';

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 40;
const CONTENT_W = PAGE_W - MARGIN * 2;
const BOTTOM = 40;

const INK = rgb(15 / 255, 23 / 255, 42 / 255);
const MUTED = rgb(100 / 255, 116 / 255, 139 / 255);
const TEAL = rgb(13 / 255, 148 / 255, 136 / 255);
const TEAL_DARK = rgb(15 / 255, 118 / 255, 110 / 255);
const LINE = rgb(226 / 255, 232 / 255, 240 / 255);
const CARD = rgb(248 / 255, 250 / 255, 252 / 255);

type Pen = {
  doc: PDFDocument;
  page: PDFPage;
  y: number;
  font: PDFFont;
  bold: PDFFont;
};

type PaintOpts = { bold?: boolean; color?: RGB };

function pdfText(font: PDFFont, value: string): string {
  const text = value.normalize('NFC');
  try {
    font.encodeText(text);
    return text;
  } catch {
    let out = '';
    for (const char of text) {
      try {
        font.encodeText(char);
        out += char;
      } catch {
        out += '?';
      }
    }
    return out;
  }
}

function breakWord(font: PDFFont, word: string, size: number, maxWidth: number): string[] {
  const parts: string[] = [];
  let current = '';
  for (const char of word) {
    const next = current + char;
    if (current && font.widthOfTextAtSize(next, size) > maxWidth) {
      parts.push(current);
      current = char;
    } else {
      current = next;
    }
  }
  if (current) parts.push(current);
  return parts.length ? parts : [word];
}

function wrapPdfText(font: PDFFont, value: string, size: number, maxWidth: number): string[] {
  const text = pdfText(font, value).trim();
  if (!text) return [];
  const lines: string[] = [];
  let current = '';
  const width = (line: string) => font.widthOfTextAtSize(line, size);
  for (const word of text.split(/\s+/)) {
    const chunks = width(word) <= maxWidth ? [word] : breakWord(font, word, size, maxWidth);
    for (const chunk of chunks) {
      const next = current ? `${current} ${chunk}` : chunk;
      if (current && width(next) > maxWidth) {
        lines.push(current);
        current = chunk;
      } else {
        current = next;
      }
    }
  }
  if (current) lines.push(current);
  return lines;
}

function paint(pen: Pen, text: string, size: number, x: number, baseline: number, opts?: PaintOpts) {
  const face = opts?.bold ? pen.bold : pen.font;
  pen.page.drawText(pdfText(face, text), {
    x,
    y: baseline,
    size,
    font: face,
    color: opts?.color ?? INK,
  });
}

function line(pen: Pen, text: string, size: number, opts?: PaintOpts & { gap?: number }) {
  const baseline = pen.y - size;
  paint(pen, text, size, MARGIN, baseline, opts);
  pen.y = baseline - (opts?.gap ?? 4);
}

function ensure(pen: Pen, height: number) {
  if (pen.y - height < BOTTOM) {
    pen.page = pen.doc.addPage([PAGE_W, PAGE_H]);
    pen.y = PAGE_H - MARGIN;
  }
}

function drawHeading(pen: Pen, text: string) {
  ensure(pen, 24);
  line(pen, text, 13, { bold: true, color: TEAL_DARK, gap: 8 });
}

function drawHeader(pen: Pen, report: ProgressReport) {
  line(pen, 'Daily English Test', 9, { color: TEAL, gap: 4 });
  const titleBaseline = pen.y - 18;
  paint(pen, 'Progress report', 18, MARGIN, titleBaseline, { bold: true });
  const date = pdfText(pen.font, report.generatedAtLabel);
  const dateW = pen.font.widthOfTextAtSize(date, 9);
  paint(pen, report.generatedAtLabel, 9, MARGIN + CONTENT_W - dateW, titleBaseline + 2, { color: MUTED });
  pen.y = titleBaseline - 12;
  const nameLines = wrapPdfText(pen.bold, report.studentName, 16, CONTENT_W);
  for (const nameLine of nameLines) line(pen, nameLine, 16, { bold: true, gap: 2 });
  pen.y -= 2;
  if (report.level) line(pen, `Level ${report.level}`, 12, { bold: true, color: TEAL_DARK, gap: 12 });
  else pen.y -= 8;
}

function drawSkills(pen: Pen, report: ProgressReport) {
  const gap = 8;
  const cardW = (CONTENT_W - gap * 2) / 3;
  const cardH = 58;
  ensure(pen, cardH + 4);
  const top = pen.y;
  report.skills.forEach((skill, index) => {
    const x = MARGIN + index * (cardW + gap);
    pen.page.drawRectangle({
      x,
      y: top - cardH,
      width: cardW,
      height: cardH,
      color: CARD,
      borderColor: LINE,
      borderWidth: 1,
    });
    paint(pen, skill.label, 9, x + 10, top - 18, { color: MUTED });
    paint(pen, skill.average, 18, x + 10, top - 42, { bold: true, color: TEAL_DARK });
  });
  pen.y = top - cardH - 18;
}

function drawLevels(pen: Pen, report: ProgressReport) {
  drawHeading(pen, 'By level');
  for (const section of report.levels) {
    ensure(pen, 32);
    line(pen, section.skill, 11, { bold: true, gap: 3 });
    if (section.empty || section.rows.length === 0) {
      line(pen, section.empty ?? 'No tests for this skill.', 10, { color: MUTED, gap: 8 });
      continue;
    }
    for (const row of section.rows) {
      ensure(pen, 16);
      const baseline = pen.y - 11;
      paint(pen, row.label, 10, MARGIN, baseline);
      const detail = pdfText(pen.font, row.detail);
      const detailW = pen.font.widthOfTextAtSize(detail, 10);
      paint(pen, row.detail, 10, MARGIN + CONTENT_W - detailW, baseline, { color: TEAL_DARK });
      pen.y = baseline - 6;
    }
    pen.y -= 6;
  }
}

function drawActivity(pen: Pen, report: ProgressReport) {
  const summaryLines = wrapPdfText(pen.font, report.activitySummary, 10, CONTENT_W);
  ensure(pen, 24 + summaryLines.length * 14 + 100);
  drawHeading(pen, 'Last 14 days');
  for (const summaryLine of summaryLines) line(pen, summaryLine, 10, { color: MUTED, gap: 2 });
  pen.y -= 8;
  const chartH = 78;
  const labelH = 16;
  ensure(pen, chartH + labelH);
  const base = pen.y - chartH;
  const barMax = chartH - 10;
  for (const mark of [0, 0.5, 1]) {
    const y = base + mark * barMax;
    pen.page.drawLine({
      start: { x: MARGIN, y },
      end: { x: MARGIN + CONTENT_W, y },
      thickness: 0.6,
      color: LINE,
    });
  }
  const slot = CONTENT_W / Math.max(1, report.activity.length);
  report.activity.forEach((day, index) => {
    if (day.percent != null) {
      const barW = Math.max(2, slot - 5);
      pen.page.drawRectangle({
        x: MARGIN + index * slot + (slot - barW) / 2,
        y: base,
        width: barW,
        height: Math.max(1.5, (day.percent / 100) * barMax),
        color: TEAL,
      });
    }
    if (index % 3 === 0) {
      paint(pen, day.label, 7, MARGIN + index * slot, base - 12, { color: MUTED });
    }
  });
  pen.y = base - labelH - 10;
}

function drawRecentItem(pen: Pen, item: RecentLine) {
  const titleLines = item.title ? wrapPdfText(pen.font, item.title, 10, CONTENT_W) : [];
  ensure(pen, 28 + titleLines.length * 13);
  line(pen, item.when || '—', 9, { color: MUTED, gap: 2 });
  const baseline = pen.y - 11;
  paint(pen, item.tags || '—', 10, MARGIN, baseline);
  const score = pdfText(pen.bold, item.score);
  const scoreW = pen.bold.widthOfTextAtSize(score, 11);
  paint(pen, item.score, 11, MARGIN + CONTENT_W - scoreW, baseline, { bold: true, color: TEAL_DARK });
  pen.y = baseline - 4;
  for (const titleLine of titleLines) line(pen, titleLine, 10, { gap: 1 });
  pen.y -= 5;
  pen.page.drawLine({
    start: { x: MARGIN, y: pen.y },
    end: { x: MARGIN + CONTENT_W, y: pen.y },
    thickness: 0.4,
    color: LINE,
  });
  pen.y -= 8;
}

function drawRecent(pen: Pen, report: ProgressReport) {
  drawHeading(pen, 'Recent tests');
  if (!report.recent.length) {
    line(pen, 'No tests yet.', 10, { color: MUTED });
    return;
  }
  for (const item of report.recent) drawRecentItem(pen, item);
}

function drawFooters(pen: Pen) {
  const pages = pen.doc.getPages();
  pages.forEach((page, index) => {
    const label = `${index + 1} / ${pages.length}`;
    const width = pen.font.widthOfTextAtSize(label, 9);
    page.drawText('Daily English Test', { x: MARGIN, y: 22, size: 9, font: pen.font, color: MUTED });
    page.drawText(label, { x: PAGE_W - MARGIN - width, y: 22, size: 9, font: pen.font, color: MUTED });
  });
}

export async function renderProgressPdf(report: ProgressReport): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${report.studentName} progress report`);
  doc.setAuthor('Daily English Test');
  doc.setCreator('Daily English Test');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const pen: Pen = {
    doc,
    page: doc.addPage([PAGE_W, PAGE_H]),
    y: PAGE_H - MARGIN,
    font,
    bold,
  };
  drawHeader(pen, report);
  drawSkills(pen, report);
  drawLevels(pen, report);
  drawActivity(pen, report);
  drawRecent(pen, report);
  drawFooters(pen);
  return doc.save();
}

function shareWasCancelled(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && (error as { name?: string }).name === 'AbortError';
}

async function deliverPdf(bytes: Uint8Array, filename: string): Promise<void> {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const android = isAndroidUserAgent(navigator.userAgent);
  if (android && typeof navigator.share === 'function') {
    const file = new File([blob], filename, { type: 'application/pdf' });
    const canShare = typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
    if (canShare) {
      try {
        await navigator.share({ files: [file], title: 'Progress report' });
        return;
      } catch (error) {
        if (shareWasCancelled(error)) return;
      }
    }
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function downloadProgressPdf(input: {
  studentName: string;
  profileLevel?: string | null;
  tests: Parameters<typeof buildProgressReport>[0]['tests'];
}): Promise<void> {
  const report = buildProgressReport(input);
  const bytes = await renderProgressPdf(report);
  await deliverPdf(bytes, report.filename);
}
