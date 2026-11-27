import type { Question, QuestionFormat, UserProfile, VerifiedAnswerRecord } from '../types/index.ts';

export interface CommunityVerifiedKeyDoc {
  questionId: string;
  correctAnswer: string | string[];
  explanation?: string;
  updatedByName?: string;
  updatedAt: number;
}

export interface ParsedManualAnswer {
  format: QuestionFormat;
  correctOption?: string;
  correctOptions?: string[];
  natAnswer?: number;
  natRangeMin?: number;
  natRangeMax?: number;
  natTolerance?: number;
  /** Canonical Firestore value for verified_keys.correctAnswer */
  correctAnswer: string | string[];
  /** Human-readable display label (e.g. "B", "A, C", "42 to 43", "16.5") */
  displayLabel: string;
}

export function sanitizeCommunityKeyId(questionId: string): string {
  const cleaned = String(questionId || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 128);
  return cleaned || 'q_unknown';
}

export function resolveContributorDisplayName(
  profile?: Partial<UserProfile> | null,
  authUser?: { displayName?: string | null } | null
): string {
  const custom = typeof profile?.displayName === 'string' ? profile.displayName.trim() : '';
  if (custom.length > 0) return custom.slice(0, 80);
  const authName = typeof authUser?.displayName === 'string' ? authUser.displayName.trim() : '';
  if (authName.length > 0) return authName.slice(0, 80);
  return 'Community';
}

export function parseNatAnswerOrRange(raw: string): {
  natAnswer: number;
  natRangeMin?: number;
  natRangeMax?: number;
  natTolerance: number;
  canonical: string;
} | null {
  const cleaned = raw.trim().replace(/[–—]/g, '-');
  if (!cleaned) return null;

  // Match "min to max" or "min - max" (supporting negative numbers like "-5 to -2" or "-5.5 - -2.5")
  const rangeMatch = cleaned.match(
    /^([+-]?(?:\d+\.?\d*|\.\d+))\s*(?:to|,|\s-\s|\.\.)\s*([+-]?(?:\d+\.?\d*|\.\d+))$/i
  );
  if (rangeMatch) {
    const a = Number(rangeMatch[1]);
    const b = Number(rangeMatch[2]);
    if (Number.isFinite(a) && Number.isFinite(b)) {
      const low = Math.min(a, b);
      const high = Math.max(a, b);
      const mid = Number(((low + high) / 2).toFixed(6));
      const tol = Number(Math.max(0.01, (high - low) / 2).toFixed(6));
      return {
        natAnswer: mid,
        natRangeMin: low,
        natRangeMax: high,
        natTolerance: tol,
        canonical: low === high ? `${low}` : `${low} to ${high}`,
      };
    }
  }

  // Also allow compact positive range like "42-43" when first char isn't minus or has a second minus
  const compactRangeMatch = cleaned.match(
    /^([+-]?(?:\d+\.?\d*|\.\d+))-([+-]?(?:\d+\.?\d*|\.\d+))$/
  );
  if (compactRangeMatch) {
    const a = Number(compactRangeMatch[1]);
    const b = Number(compactRangeMatch[2]);
    if (Number.isFinite(a) && Number.isFinite(b)) {
      const low = Math.min(a, b);
      const high = Math.max(a, b);
      const mid = Number(((low + high) / 2).toFixed(6));
      const tol = Number(Math.max(0.01, (high - low) / 2).toFixed(6));
      return {
        natAnswer: mid,
        natRangeMin: low,
        natRangeMax: high,
        natTolerance: tol,
        canonical: low === high ? `${low}` : `${low} to ${high}`,
      };
    }
  }

  const single = Number(cleaned);
  if (!Number.isFinite(single)) return null;
  return {
    natAnswer: single,
    natTolerance: 0.01,
    canonical: `${single}`,
  };
}

export function parseManualAnswerInput(
  format: QuestionFormat,
  rawInput: string
): ParsedManualAnswer | null {
  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  if (format === 'MCQ') {
    const upper = trimmed.toUpperCase().replace(/[^A-E]/g, '');
    if (upper.length !== 1) return null;
    return {
      format: 'MCQ',
      correctOption: upper,
      correctAnswer: upper,
      displayLabel: upper,
    };
  }

  if (format === 'MSQ') {
    const letters = Array.from(
      new Set(
        trimmed
          .toUpperCase()
          .replace(/[^A-E]/g, '')
          .split('')
          .filter(Boolean)
      )
    ).sort();
    if (letters.length === 0) return null;
    return {
      format: 'MSQ',
      correctOptions: letters,
      correctAnswer: letters,
      displayLabel: letters.join(', '),
    };
  }

  // NAT
  const nat = parseNatAnswerOrRange(trimmed);
  if (!nat) return null;
  return {
    format: 'NAT',
    natAnswer: nat.natAnswer,
    natRangeMin: nat.natRangeMin,
    natRangeMax: nat.natRangeMax,
    natTolerance: nat.natTolerance,
    correctAnswer: nat.canonical,
    displayLabel: nat.canonical,
  };
}

export function communityKeyDocToVerifiedRecord(
  doc: CommunityVerifiedKeyDoc,
  fallbackFormat?: QuestionFormat
): VerifiedAnswerRecord | null {
  if (!doc || typeof doc.questionId !== 'string' || !doc.questionId.trim()) return null;

  const updatedAtMs =
    typeof doc.updatedAt === 'number' && Number.isFinite(doc.updatedAt) && doc.updatedAt > 0
      ? doc.updatedAt
      : Date.now();
  const updatedAtIso = new Date(updatedAtMs).toISOString();
  const explanation = typeof doc.explanation === 'string' ? doc.explanation.trim() : '';
  const updatedByName =
    typeof doc.updatedByName === 'string' && doc.updatedByName.trim().length > 0
      ? doc.updatedByName.trim().slice(0, 80)
      : 'Community';

  // Array => MSQ
  if (Array.isArray(doc.correctAnswer)) {
    const opts = Array.from(
      new Set(
        doc.correctAnswer
          .map((x) => String(x || '').trim().toUpperCase())
          .filter((x) => /^[A-E]$/.test(x))
      )
    ).sort();
    if (opts.length === 0) return null;
    return {
      questionId: doc.questionId,
      format: 'MSQ',
      correctOptions: opts,
      explanation,
      wrongOptionAnalysis: '',
      source: 'manual',
      updatedByName,
      updatedAtMs,
      updatedAt: updatedAtIso,
    };
  }

  if (typeof doc.correctAnswer !== 'string') return null;
  const raw = doc.correctAnswer.trim();
  if (!raw) return null;

  // Respect explicit format when compatible, else infer cleanly
  if (fallbackFormat === 'MSQ') {
    const parsed = parseManualAnswerInput('MSQ', raw);
    if (parsed?.correctOptions) {
      return {
        questionId: doc.questionId,
        format: 'MSQ',
        correctOptions: parsed.correctOptions,
        explanation,
        wrongOptionAnalysis: '',
        source: 'manual',
        updatedByName,
        updatedAtMs,
        updatedAt: updatedAtIso,
      };
    }
  }

  if (fallbackFormat === 'NAT') {
    const nat = parseNatAnswerOrRange(raw);
    if (nat) {
      return {
        questionId: doc.questionId,
        format: 'NAT',
        natAnswer: nat.natAnswer,
        natRangeMin: nat.natRangeMin,
        natRangeMax: nat.natRangeMax,
        natTolerance: nat.natTolerance,
        explanation,
        wrongOptionAnalysis: '',
        source: 'manual',
        updatedByName,
        updatedAtMs,
        updatedAt: updatedAtIso,
      };
    }
  }

  // Inferred MCQ (single A-E letter)
  if (/^[A-E]$/i.test(raw)) {
    return {
      questionId: doc.questionId,
      format: 'MCQ',
      correctOption: raw.toUpperCase(),
      explanation,
      wrongOptionAnalysis: '',
      source: 'manual',
      updatedByName,
      updatedAtMs,
      updatedAt: updatedAtIso,
    };
  }

  // Inferred NAT (scalar or range)
  const nat = parseNatAnswerOrRange(raw);
  if (nat) {
    return {
      questionId: doc.questionId,
      format: 'NAT',
      natAnswer: nat.natAnswer,
      natRangeMin: nat.natRangeMin,
      natRangeMax: nat.natRangeMax,
      natTolerance: nat.natTolerance,
      explanation,
      wrongOptionAnalysis: '',
      source: 'manual',
      updatedByName,
      updatedAtMs,
      updatedAt: updatedAtIso,
    };
  }

  // Fallback comma-separated MSQ string (e.g. "A, C")
  const msq = parseManualAnswerInput('MSQ', raw);
  if (msq?.correctOptions && msq.correctOptions.length > 0) {
    return {
      questionId: doc.questionId,
      format: msq.correctOptions.length === 1 && fallbackFormat === 'MCQ' ? 'MCQ' : 'MSQ',
      correctOption:
        msq.correctOptions.length === 1 && fallbackFormat === 'MCQ'
          ? msq.correctOptions[0]
          : undefined,
      correctOptions:
        msq.correctOptions.length === 1 && fallbackFormat === 'MCQ'
          ? undefined
          : msq.correctOptions,
      explanation,
      wrongOptionAnalysis: '',
      source: 'manual',
      updatedByName,
      updatedAtMs,
      updatedAt: updatedAtIso,
    };
  }

  return null;
}

export function verifiedRecordToCommunityKeyDoc(
  record: VerifiedAnswerRecord,
  fallbackContributorName: string = 'Community'
): CommunityVerifiedKeyDoc | null {
  const questionId = sanitizeCommunityKeyId(record.questionId);
  let correctAnswer: string | string[] | null = null;

  if (record.format === 'MCQ' && record.correctOption) {
    const opt = record.correctOption.trim().toUpperCase();
    if (/^[A-E]$/.test(opt)) correctAnswer = opt;
  } else if (record.format === 'MSQ' && record.correctOptions && record.correctOptions.length > 0) {
    const opts = Array.from(
      new Set(
        record.correctOptions
          .map((o) => o.trim().toUpperCase())
          .filter((o) => /^[A-E]$/.test(o))
      )
    ).sort();
    if (opts.length > 0) correctAnswer = opts;
  } else if (record.format === 'NAT') {
    if (
      typeof record.natRangeMin === 'number' &&
      typeof record.natRangeMax === 'number' &&
      Number.isFinite(record.natRangeMin) &&
      Number.isFinite(record.natRangeMax)
    ) {
      const low = Math.min(record.natRangeMin, record.natRangeMax);
      const high = Math.max(record.natRangeMin, record.natRangeMax);
      correctAnswer = low === high ? `${low}` : `${low} to ${high}`;
    } else if (typeof record.natAnswer === 'number' && Number.isFinite(record.natAnswer)) {
      correctAnswer = `${record.natAnswer}`;
    }
  }

  if (!correctAnswer) return null;

  const updatedAt =
    typeof record.updatedAtMs === 'number' && Number.isFinite(record.updatedAtMs) && record.updatedAtMs > 0
      ? record.updatedAtMs
      : Date.parse(record.updatedAt) || Date.now();

  const updatedByName = (record.updatedByName || fallbackContributorName || 'Community')
    .trim()
    .slice(0, 80);

  const doc: CommunityVerifiedKeyDoc = {
    questionId,
    correctAnswer,
    updatedByName: updatedByName || 'Community',
    updatedAt,
  };

  const trimmedExplanation = (record.explanation || '').trim().slice(0, 5000);
  if (trimmedExplanation.length > 0) {
    doc.explanation = trimmedExplanation;
  }

  return doc;
}

export function getRecordUpdatedAtMs(record?: VerifiedAnswerRecord): number {
  if (!record) return 0;
  if (typeof record.updatedAtMs === 'number' && Number.isFinite(record.updatedAtMs)) {
    return record.updatedAtMs;
  }
  const parsed = Date.parse(record.updatedAt || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Merges shared community keys with local/personal verified keys by latest timestamp.
 * Community keys win on equal timestamps so global updates propagate consistently.
 */
export function mergeCommunityAndLocalVerifiedKeys(
  communityMap: Record<string, VerifiedAnswerRecord>,
  localMap: Record<string, VerifiedAnswerRecord>
): Record<string, VerifiedAnswerRecord> {
  const merged: Record<string, VerifiedAnswerRecord> = { ...localMap };
  for (const [qId, communityRec] of Object.entries(communityMap)) {
    const existing = merged[qId];
    if (!existing) {
      merged[qId] = communityRec;
      continue;
    }
    const communityTs = getRecordUpdatedAtMs(communityRec);
    const localTs = getRecordUpdatedAtMs(existing);
    if (communityTs >= localTs) {
      merged[qId] = {
        ...existing,
        ...communityRec,
        // Preserve rich existing explanation/wrongOptionAnalysis if community doc omitted it
        explanation: communityRec.explanation || existing.explanation,
        wrongOptionAnalysis: communityRec.wrongOptionAnalysis || existing.wrongOptionAnalysis,
      };
    }
  }
  return merged;
}

export function formatQuestionKeySeed(question: Question): string {
  if (question.format === 'MCQ') {
    return question.correctOption ?? '';
  }
  if (question.format === 'MSQ') {
    return (question.correctOptions ?? []).join(', ');
  }
  if (
    typeof question.natRangeMin === 'number' &&
    typeof question.natRangeMax === 'number' &&
    Number.isFinite(question.natRangeMin) &&
    Number.isFinite(question.natRangeMax) &&
    question.natRangeMin !== question.natRangeMax
  ) {
    return `${question.natRangeMin} to ${question.natRangeMax}`;
  }
  if (typeof question.natAnswer === 'number' && Number.isFinite(question.natAnswer)) {
    return String(question.natAnswer);
  }
  return '';
}

export function formatOfficialKeyBadge(question: Question): string | null {
  if (question.format === 'MCQ' && question.correctOption) {
    return `Option ${question.correctOption}`;
  }
  if (question.format === 'MSQ' && question.correctOptions && question.correctOptions.length > 0) {
    return `Options ${question.correctOptions.join(', ')}`;
  }
  if (question.format === 'NAT') {
    if (
      typeof question.natRangeMin === 'number' &&
      typeof question.natRangeMax === 'number' &&
      Number.isFinite(question.natRangeMin) &&
      Number.isFinite(question.natRangeMax) &&
      question.natRangeMin !== question.natRangeMax
    ) {
      return `${question.natRangeMin} to ${question.natRangeMax}${question.natUnit ? ` ${question.natUnit}` : ''}`;
    }
    if (typeof question.natAnswer === 'number' && Number.isFinite(question.natAnswer)) {
      return `${question.natAnswer}${question.natUnit ? ` ${question.natUnit}` : ''}`;
    }
  }
  return null;
}
