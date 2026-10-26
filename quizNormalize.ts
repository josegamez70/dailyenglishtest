/**
 * The model sometimes labels options itself ("A. ...", "B) ...", "(C) ...", "A ...").
 * The UI also prints A/B/C/D, so those prefixes must be removed or the letter shows twice.
 * correctAnswer is then matched against the cleaned option text.
 */

export type RawQuiz = {
  question?: string;
  options?: unknown[];
  correctAnswer?: string;
  correct?: string;
  answer?: string;
  correctAnswerIndex?: number;
  explanation?: string;
  supportingSentence?: string;
  evidence?: string;
  support?: string;
};

export type NormalizedQuizQuestion = {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  supportingSentence: string;
};

function asText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/** Remove one unambiguous label: "(A)", "A.", "A)", "A:", "A-". */
export function stripPunctuatedLabel(input: string): string {
  const text = asText(input);
  const withoutParens = text.replace(/^[\(\[]\s*[A-D]\s*[\)\]]\s*/i, '').trim();
  return withoutParens.replace(/^[A-D]\s*[\.\)\:\-]\s+/i, '').trim();
}

/**
 * Remove a leading "A " / "B " only when it is this option's own letter
 * and the next word starts with a capital ("A Melody", not "A red bicycle").
 */
export function stripIndexedCapitalLabel(option: string, index: number): string {
  const match = option.match(/^([A-Da-d])\s+([A-Z].*)$/);
  if (!match) return option;
  const expected = String.fromCharCode(65 + index);
  if (match[1].toUpperCase() !== expected) return option;
  return match[2].trim();
}

function stripRepeatedLetterLabels(options: string[]): string[] {
  const labeled = options.map((option, index) => {
    const match = option.match(/^([A-Da-d])\s+\S/);
    if (!match) return false;
    return match[1].toUpperCase() === String.fromCharCode(65 + index);
  });
  const needed = Math.min(3, options.length);
  if (labeled.filter(Boolean).length < needed) return options;
  return options.map((option, index) =>
    labeled[index] ? option.replace(/^[A-Da-d]\s+/, '').trim() : option
  );
}

export function cleanOptions(rawOptions: unknown[]): string[] {
  let options = rawOptions.map((option) => stripPunctuatedLabel(asText(option)));
  options = options.map((option, index) => {
    let current = option;
    for (let pass = 0; pass < 2; pass++) {
      const next = stripIndexedCapitalLabel(current, index);
      if (next === current) break;
      current = next;
    }
    return current.trim();
  });
  options = stripRepeatedLetterLabels(options);
  return options.map((option) => option.trim());
}

function isLetterOnly(answer: string): string | null {
  const match = answer.match(/^(?:[\(\[]\s*)?([A-D])(?:\s*[\)\]])?\s*[\.\)\:\-]?\s*$/i);
  if (!match) return null;
  if (answer.trim().length > 4) return null;
  return match[1].toUpperCase();
}

export function resolveCorrectAnswer(
  rawAnswer: string,
  cleanedOptions: string[]
): string {
  const original = asText(rawAnswer);
  const letter = isLetterOnly(original);
  if (letter) {
    const index = letter.charCodeAt(0) - 65;
    if (cleanedOptions[index]) return cleanedOptions[index];
  }

  const punctuated = stripPunctuatedLabel(original);
  const exact = cleanedOptions.find(
    (option) =>
      option.toLowerCase() === original.toLowerCase() ||
      option.toLowerCase() === punctuated.toLowerCase()
  );
  if (exact) return exact;

  const lead = punctuated.match(/^([A-Da-d])\s+(.*)$/);
  if (lead) {
    const index = lead[1].toUpperCase().charCodeAt(0) - 65;
    let rest = lead[2].trim();
    const again = stripIndexedCapitalLabel(rest, index);
    if (again !== rest) rest = again;
    if (cleanedOptions[index] && cleanedOptions[index].toLowerCase() === rest.toLowerCase()) {
      return cleanedOptions[index];
    }
    const byRest = cleanedOptions.find((option) => option.toLowerCase() === rest.toLowerCase());
    if (byRest) return byRest;
  }

  // Keep the cleaned text when nothing matches. Do not guess option A.
  return punctuated || original;
}

export function normalizeQuiz(raw: RawQuiz[]): NormalizedQuizQuestion[] {
  return (raw || []).map((item) => {
    const rawOptions = Array.isArray(item?.options) ? item.options : [];
    const options = cleanOptions(rawOptions);
    let rawAnswer = asText(item?.correctAnswer ?? item?.correct ?? item?.answer);
    if (
      !rawAnswer &&
      typeof item?.correctAnswerIndex === 'number' &&
      item.correctAnswerIndex >= 0 &&
      item.correctAnswerIndex < 26
    ) {
      rawAnswer = String.fromCharCode(65 + item.correctAnswerIndex);
    }
    return {
      question: asText(item?.question),
      options,
      correctAnswer: resolveCorrectAnswer(rawAnswer, options),
      explanation: asText(item?.explanation),
      supportingSentence: asText(item?.supportingSentence ?? item?.evidence ?? item?.support),
    };
  });
}
