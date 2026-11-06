import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import { isAndroidUserAgent } from './device';
import { buildProgressReport, type ProgressReport, type RecentLine } from './progressReport';

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 32;
const CONTENT_W = PAGE_W - MARGIN * 2;
/** Content stays above the footer. The report never opens a second page. */
const BOTTOM = 28;
const RECENT_ROW = 12;
const RECENT_NOTE = 11;

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

function clipText(font: PDFFont, value: string, size: number, maxWidth: number): string {
  const safe = pdfText(font, value).trim();
  if (!safe || maxWidth <= 0) return '';
  if (font.widthOfTextAtSize(safe, size) <= maxWidth) return safe;
  let out = safe;
  while (out.length > 1 && font.widthOfTextAtSize(`${out}...`, size) > maxWidth) {
    out = out.slice(0, -1).trimEnd();
  }
  return out ? `${out}...` : '';
}

/** Rows that fit in `room`, leaving one line for a truncation note when some tests remain. */
export function recentTestsThatFit(total: number, room: number, rowHeight = RECENT_ROW, noteHeight = RECENT_NOTE): number {
  if (total <= 0 || room < rowHeight || rowHeight <= 0) return 0;
  if (total * rowHeight <= room) return total;
  if (noteHeight >= room) return 0;
  return Math.max(0, Math.min(total, Math.floor((room - noteHeight) / rowHeight)));
}

function roomLeft(pen: Pen): number {
  return pen.y - BOTTOM;
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

function textLine(pen: Pen, text: string, size: number, opts?: PaintOpts & { gap?: number }) {
  const baseline = pen.y - size;
  const face = opts?.bold ? pen.bold : pen.font;
  paint(pen, clipText(face, text, size, CONTENT_W), size, MARGIN, baseline, opts);
  pen.y = baseline - (opts?.gap ?? 3);
}

function drawHeader(pen: Pen, report: ProgressReport) {
  textLine(pen, 'Daily English Test', 8, { color: TEAL, gap: 2 });
  const titleSize = 13;
  const titleBaseline = pen.y - titleSize;
  paint(pen, 'Progress report', titleSize, MARGIN, titleBaseline, { bold: true });
  const date = clipText(pen.font, report.generatedAtLabel, 8, 180);
  const dateW = pen.font.widthOfTextAtSize(date, 8);
  paint(pen, date, 8, MARGIN + CONTENT_W - dateW, titleBaseline + 1, { color: MUTED });
  pen.y = titleBaseline - 5;
  const nameSize = 12;
  const nameBaseline = pen.y - nameSize;
  const level = report.level ? `Level ${report.level}` : '';
  const levelW = level ? pen.bold.widthOfTextAtSize(pdfText(pen.bold, level), 11) : 0;
  const nameMax = level ? CONTENT_W - levelW - 12 : CONTENT_W;
  paint(pen, clipText(pen.bold, report.studentName, nameSize, nameMax), nameSize, MARGIN, nameBaseline, { bold: true });
  if (level) paint(pen, level, 11, MARGIN + CONTENT_W - levelW, nameBaseline, { bold: true, color: TEAL_DARK });
  pen.y = nameBaseline - 8;
}

function drawSkills(pen: Pen, report: ProgressReport) {
  const gap = 8;
  const cardW = (CONTENT_W - gap * 2) / 3;
  const cardH = 36;
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
    paint(pen, skill.label, 8, x + 8, top - 12, { color: MUTED });
    paint(pen, skill.average, 14, x + 8, top - 28, { bold: true, color: TEAL_DARK });
  });
  pen.y = top - cardH - 10;
}

function drawLevels(pen: Pen, report: ProgressReport) {
  textLine(pen, 'By level', 11, { bold: true, color: TEAL_DARK, gap: 3 });
  const gap = 10;
  const colW = (CONTENT_W - gap * 2) / 3;
  const rowH = 11;
  const nameH = 13;
  const maxRows = Math.max(1, ...report.levels.map((section) => Math.max(section.rows.length, 1)));
  const top = pen.y;
  report.levels.forEach((section, index) => {
    const x = MARGIN + index * (colW + gap);
    paint(pen, section.skill, 9, x, top - 9, { bold: true });
    const rows = section.rows.length
      ? section.rows
      : [{ label: section.empty ?? 'No tests for this skill.', detail: '' }];
    rows.forEach((row, rowIndex) => {
      const baseline = top - nameH - rowIndex * rowH - 8;
      if (!row.detail) {
        paint(pen, clipText(pen.font, row.label, 8, colW), 8, x, baseline, { color: MUTED });
        return;
      }
      const detail = clipText(pen.font, row.detail, 8, colW * 0.58);
      const detailW = pen.font.widthOfTextAtSize(detail, 8);
      paint(pen, clipText(pen.font, row.label, 8, Math.max(16, colW - detailW - 4)), 8, x, baseline);
      paint(pen, detail, 8, x + colW - detailW, baseline, { color: TEAL_DARK });
    });
  });
  pen.y = top - nameH - maxRows * rowH - 4;
}

function drawActivity(pen: Pen, report: ProgressReport) {
  const heading = 'Last 14 days';
  const chartH = 44;
  const labelH = 10;
  const full = 16 + chartH + labelH;
  if (roomLeft(pen) < 14) return;
  if (roomLeft(pen) < full) {
    textLine(pen, `${heading} · ${report.activitySummary}`, 8, { color: MUTED, gap: 4 });
    return;
  }
  const headBaseline = pen.y - 10;
  paint(pen, heading, 10, MARGIN, headBaseline, { bold: true, color: TEAL_DARK });
  const headW = pen.bold.widthOfTextAtSize(heading, 10);
  paint(
    pen,
    clipText(pen.font, report.activitySummary, 8, CONTENT_W - headW - 8),
    8,
    MARGIN + headW + 8,
    headBaseline,
    { color: MUTED },
  );
  pen.y = headBaseline - 5;
  const base = pen.y - chartH;
  const barMax = chartH - 6;
  for (const mark of [0, 0.5, 1]) {
    const y = base + mark * barMax;
    pen.page.drawLine({
      start: { x: MARGIN, y },
      end: { x: MARGIN + CONTENT_W, y },
      thickness: 0.5,
      color: LINE,
    });
  }
  const slot = CONTENT_W / Math.max(1, report.activity.length);
  report.activity.forEach((day, index) => {
    if (day.percent != null) {
      const barW = Math.max(3, slot - 4);
      pen.page.drawRectangle({
        x: MARGIN + index * slot + (slot - barW) / 2,
        y: base,
        width: barW,
        height: Math.max(1.2, (day.percent / 100) * barMax),
        color: TEAL,
      });
    }
    if (index % 3 === 0) {
      paint(pen, day.label, 6.5, MARGIN + index * slot, base - 8, { color: MUTED });
    }
  });
  pen.y = base - labelH - 2;
}

function drawRecentRow(pen: Pen, item: RecentLine) {
  const baseline = pen.y - 9;
  const when = clipText(pen.font, item.when || '—', 8, 128);
  paint(pen, when, 8, MARGIN, baseline, { color: MUTED });
  const score = clipText(pen.bold, item.score, 9, 40);
  const scoreW = pen.bold.widthOfTextAtSize(score, 9);
  paint(pen, score, 9, MARGIN + CONTENT_W - scoreW, baseline, { bold: true, color: TEAL_DARK });
  const tagsX = MARGIN + 132;
  const tagsMax = CONTENT_W - 132 - scoreW - 8;
  paint(pen, clipText(pen.font, item.tags || '—', 8, tagsMax), 8, tagsX, baseline);
  pen.y = baseline - 3;
}

function drawRecent(pen: Pen, report: ProgressReport) {
  if (roomLeft(pen) < 14) return;
  textLine(pen, 'Recent tests', 11, { bold: true, color: TEAL_DARK, gap: 3 });
  if (!report.recent.length) {
    if (roomLeft(pen) >= 11) textLine(pen, 'No tests yet.', 8, { color: MUTED, gap: 2 });
    return;
  }
  const shown = recentTestsThatFit(report.recent.length, roomLeft(pen));
  for (let index = 0; index < shown; index += 1) drawRecentRow(pen, report.recent[index]);
  if (shown < report.recent.length && roomLeft(pen) >= RECENT_NOTE) {
    textLine(pen, `Showing ${shown} of ${report.recent.length} tests.`, 8, { color: MUTED, gap: 2 });
  }
}

function drawFooter(pen: Pen) {
  pen.page.drawText('Daily English Test', {
    x: MARGIN,
    y: 14,
    size: 8,
    font: pen.font,
    color: MUTED,
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
    y: PAGE_H - 26,
    font,
    bold,
  };
  drawHeader(pen, report);
  drawSkills(pen, report);
  drawLevels(pen, report);
  drawActivity(pen, report);
  drawRecent(pen, report);
  drawFooter(pen);
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
