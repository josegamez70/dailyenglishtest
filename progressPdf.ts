import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import { isAndroidUserAgent } from './device';
import { buildProgressReport, type ProgressReport, type RecentLine } from './progressReport';

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 32;
const CONTENT_W = PAGE_W - MARGIN * 2;
/** Content stays above the footer. The report never opens a second page. */
const BOTTOM = 28;
const CONTENT_TOP = 26;
const CONTENT_HEIGHT = PAGE_H - CONTENT_TOP - BOTTOM;

const HEADER_H = 72;
const CARDS_H = 76;
const TABS_H = 26;
const LEVEL_ROW_H = 13;
const LEVEL_PAD = 10;
const CHART_MIN = 210;
const RECENT_HEAD = 18;
const RECENT_ROW = 14;
const RECENT_NOTE = 12;

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

export type PageLayout = {
  chartHeight: number;
  recentShown: number;
};

/** One A4 page: a tall chart fills leftover space, and recent tests take the bottom. */
export function progressPageLayout(levelRows: number, recentCount: number, contentHeight = CONTENT_HEIGHT): PageLayout {
  const rows = Math.max(1, levelRows);
  const fixed = HEADER_H + CARDS_H + TABS_H + rows * LEVEL_ROW_H + LEVEL_PAD;
  const rest = Math.max(0, contentHeight - fixed);
  const roomForRecent = Math.max(0, rest - CHART_MIN);
  const shown = recentCount === 0
    ? 0
    : recentTestsThatFit(recentCount, Math.max(0, roomForRecent - RECENT_HEAD));
  const truncated = shown < recentCount;
  const recentBlock = RECENT_HEAD + (recentCount === 0 ? RECENT_NOTE : shown * RECENT_ROW + (truncated ? RECENT_NOTE : 0));
  return {
    chartHeight: Math.max(0, rest - recentBlock),
    recentShown: shown,
  };
}

function averagePercent(label: string): number | null {
  const match = /^(\d+)/.exec(label.trim());
  if (!match) return null;
  return Math.max(0, Math.min(100, Number(match[1])));
}

function levelRowCount(report: ProgressReport): number {
  return Math.max(1, ...report.levels.map((section) => Math.max(section.rows.length, 1)));
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

function drawHeader(pen: Pen, report: ProgressReport) {
  const top = pen.y;
  const brandBaseline = top - 10;
  paint(pen, 'Daily English Test', 8, MARGIN, brandBaseline, { color: TEAL });
  const date = clipText(pen.font, report.generatedAtLabel, 8, 180);
  const dateW = pen.font.widthOfTextAtSize(date, 8);
  paint(pen, date, 8, MARGIN + CONTENT_W - dateW, brandBaseline, { color: MUTED });
  const nameBaseline = top - 36;
  paint(pen, clipText(pen.bold, report.studentName, 20, CONTENT_W), 20, MARGIN, nameBaseline, { bold: true });
  if (report.level) {
    const label = pdfText(pen.bold, report.level);
    const textW = pen.bold.widthOfTextAtSize(label, 9);
    const badgeW = textW + 16;
    const badgeH = 16;
    const badgeBottom = nameBaseline - 22;
    pen.page.drawRectangle({
      x: MARGIN,
      y: badgeBottom,
      width: badgeW,
      height: badgeH,
      borderColor: TEAL_DARK,
      borderWidth: 1,
      color: rgb(240 / 255, 253 / 255, 250 / 255),
    });
    paint(pen, label, 9, MARGIN + 8, badgeBottom + 4, { bold: true, color: TEAL_DARK });
  }
  pen.y = top - HEADER_H;
}

function drawSkills(pen: Pen, report: ProgressReport) {
  const top = pen.y;
  const gap = 8;
  const cardW = (CONTENT_W - gap * 2) / 3;
  const cardH = 62;
  report.skills.forEach((skill, index) => {
    const x = MARGIN + index * (cardW + gap);
    const cardBottom = top - cardH;
    pen.page.drawRectangle({
      x,
      y: cardBottom,
      width: cardW,
      height: cardH,
      color: CARD,
      borderColor: LINE,
      borderWidth: 1,
    });
    paint(pen, skill.label, 9, x + 10, top - 16, { color: MUTED });
    paint(pen, skill.average, 18, x + 10, top - 40, { bold: true, color: TEAL_DARK });
    const trackW = cardW - 20;
    const trackY = cardBottom + 10;
    pen.page.drawRectangle({
      x: x + 10,
      y: trackY,
      width: trackW,
      height: 5,
      color: LINE,
    });
    const percent = averagePercent(skill.average);
    if (percent != null && percent > 0) {
      pen.page.drawRectangle({
        x: x + 10,
        y: trackY,
        width: Math.max(2, trackW * (percent / 100)),
        height: 5,
        color: TEAL,
      });
    }
  });
  pen.y = top - CARDS_H;
}

function drawLevels(pen: Pen, report: ProgressReport) {
  const top = pen.y;
  const tabH = 22;
  const tabW = CONTENT_W / 3;
  pen.page.drawRectangle({
    x: MARGIN,
    y: top - tabH,
    width: CONTENT_W,
    height: tabH,
    borderColor: LINE,
    borderWidth: 1,
    color: rgb(248 / 255, 250 / 255, 252 / 255),
  });
  report.levels.forEach((section, index) => {
    const label = pdfText(pen.bold, section.skill);
    const labelW = pen.bold.widthOfTextAtSize(label, 9);
    paint(pen, label, 9, MARGIN + index * tabW + (tabW - labelW) / 2, top - 15, { bold: true });
    if (index > 0) {
      const x = MARGIN + index * tabW;
      pen.page.drawLine({
        start: { x, y: top - tabH + 4 },
        end: { x, y: top - 4 },
        thickness: 0.6,
        color: LINE,
      });
    }
  });
  const colGap = 8;
  const colW = (CONTENT_W - colGap * 2) / 3;
  const rowTop = top - TABS_H;
  report.levels.forEach((section, index) => {
    const x = MARGIN + index * (colW + colGap);
    const rows = section.rows.length
      ? section.rows
      : [{ label: section.empty ?? 'No tests for this skill.', detail: '' }];
    rows.forEach((row, rowIndex) => {
      const baseline = rowTop - rowIndex * LEVEL_ROW_H - 11;
      if (!row.detail) {
        paint(pen, clipText(pen.font, row.label, 8, colW), 8, x, baseline, { color: MUTED });
        return;
      }
      const detail = clipText(pen.font, row.detail, 8, colW * 0.62);
      const detailW = pen.font.widthOfTextAtSize(detail, 8);
      paint(pen, clipText(pen.font, row.label, 8, Math.max(18, colW - detailW - 4)), 8, x, baseline);
      paint(pen, detail, 8, x + colW - detailW, baseline, { color: TEAL_DARK });
    });
  });
  pen.y = top - TABS_H - levelRowCount(report) * LEVEL_ROW_H - LEVEL_PAD;
}

function drawActivity(pen: Pen, report: ProgressReport, height: number) {
  const top = pen.y;
  const bottom = top - height;
  if (height < 36) {
    pen.y = bottom;
    return;
  }
  pen.page.drawRectangle({
    x: MARGIN,
    y: bottom,
    width: CONTENT_W,
    height,
    borderColor: LINE,
    borderWidth: 1,
    color: rgb(1, 1, 1),
  });
  const titleBaseline = top - 16;
  paint(pen, 'Last 14 days', 11, MARGIN + 10, titleBaseline, { bold: true });
  const summary = clipText(pen.font, report.activitySummary, 8, CONTENT_W - 150);
  const summaryW = pen.font.widthOfTextAtSize(summary, 8);
  paint(pen, summary, 8, MARGIN + CONTENT_W - 10 - summaryW, titleBaseline, { color: MUTED });
  const gutter = 28;
  const labelH = 16;
  const plotLeft = MARGIN + 10 + gutter;
  const plotRight = MARGIN + CONTENT_W - 10;
  const plotBottom = bottom + 8 + labelH;
  const plotTop = titleBaseline - 10;
  const plotH = Math.max(8, plotTop - plotBottom);
  const plotW = plotRight - plotLeft;
  for (const mark of [0, 25, 50, 75, 100]) {
    const y = plotBottom + (mark / 100) * plotH;
    pen.page.drawLine({
      start: { x: plotLeft, y },
      end: { x: plotRight, y },
      thickness: 0.4,
      color: LINE,
    });
    const label = `${mark}%`;
    const labelW = pen.font.widthOfTextAtSize(label, 7);
    paint(pen, label, 7, plotLeft - labelW - 4, y - 2, { color: MUTED });
  }
  const days = report.activity.length || 1;
  const slot = plotW / days;
  report.activity.forEach((day, index) => {
    const slotX = plotLeft + index * slot;
    if (day.percent != null) {
      const barW = Math.max(4, slot - 8);
      pen.page.drawRectangle({
        x: slotX + (slot - barW) / 2,
        y: plotBottom,
        width: barW,
        height: Math.max(1.5, (day.percent / 100) * plotH),
        color: TEAL,
      });
    }
    if (index % 3 === 0) {
      const date = pdfText(pen.font, day.label);
      const dateW = pen.font.widthOfTextAtSize(date, 8);
      paint(pen, date, 8, slotX + (slot - dateW) / 2, plotBottom - 12, { color: MUTED });
    }
  });
  pen.y = bottom;
}

function drawRecentRow(pen: Pen, item: RecentLine) {
  const baseline = pen.y - 10;
  paint(pen, clipText(pen.font, item.when || '—', 8, 132), 8, MARGIN, baseline, { color: MUTED });
  const score = clipText(pen.bold, item.score, 9, 42);
  const scoreW = pen.bold.widthOfTextAtSize(score, 9);
  paint(pen, score, 9, MARGIN + CONTENT_W - scoreW, baseline, { bold: true, color: TEAL_DARK });
  const tagsX = MARGIN + 136;
  paint(pen, clipText(pen.font, item.tags || '—', 8, CONTENT_W - 136 - scoreW - 8), 8, tagsX, baseline);
  pen.y -= RECENT_ROW;
}

function drawRecent(pen: Pen, report: ProgressReport, shown: number) {
  const top = pen.y;
  paint(pen, 'Recent tests', 11, MARGIN, top - 12, { bold: true, color: TEAL_DARK });
  if (shown < report.recent.length) {
    const note = `Showing ${shown} of ${report.recent.length} tests`;
    const noteW = pen.font.widthOfTextAtSize(note, 8);
    paint(pen, note, 8, MARGIN + CONTENT_W - noteW, top - 11, { color: MUTED });
  }
  pen.y = top - RECENT_HEAD;
  if (!report.recent.length) {
    paint(pen, 'No tests yet.', 8, MARGIN, pen.y - 9, { color: MUTED });
    pen.y -= RECENT_NOTE;
    return;
  }
  for (let index = 0; index < shown; index += 1) drawRecentRow(pen, report.recent[index]);
  if (shown < report.recent.length) pen.y -= RECENT_NOTE;
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
    y: PAGE_H - CONTENT_TOP,
    font,
    bold,
  };
  const layout = progressPageLayout(levelRowCount(report), report.recent.length);
  drawHeader(pen, report);
  drawSkills(pen, report);
  drawLevels(pen, report);
  drawActivity(pen, report, layout.chartHeight);
  drawRecent(pen, report, layout.recentShown);
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
