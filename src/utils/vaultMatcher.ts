import type { Question, QuestionAttemptRecord, VaultCard } from '../types/index.ts';
import { SUBJECT_MAP } from '../data/syllabus.ts';

export interface VaultPyqMatchResult {
  questions: Question[];
  strictMatchCount: number;
  usedSubjectFallback: boolean;
  fallbackLabel?: string;
}

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'when', 'where', 'what',
  'which', 'does', 'have', 'been', 'will', 'your', 'only', 'also', 'than', 'then',
  'over', 'under', 'each', 'every', 'always', 'never', 'must', 'trap', 'formula',
  'shortcut', 'rule', 'case', 'edge', 'gate', 'cse', 'exam', 'vs', 'not', 'are',
  'all', 'any', 'but', 'can', 'how', 'why', 'its', 'use', 'using', 'based', 'type',
]);

function normalizeToken(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[_/]+/g, ' ')
    .replace(/[^a-z0-9+#.-]+/g, ' ')
    .trim();
}

function stripHtmlFast(html: string | undefined): string {
  if (!html) return '';
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function extractCardKeywords(card: VaultCard): {
  exactTags: string[];
  conceptTerms: string[];
} {
  const exactTags = new Set<string>();
  const conceptTerms = new Set<string>();

  for (const rawKw of card.tagMatchKeywords ?? []) {
    const clean = rawKw.trim().toLowerCase();
    if (!clean) continue;
    exactTags.add(clean);
    exactTags.add(clean.replace(/\s+/g, '-'));
    const spaced = normalizeToken(clean);
    if (spaced.length >= 2) {
      conceptTerms.add(spaced);
      for (const word of spaced.split(/\s+/)) {
        if (word.length >= 3 && !STOP_WORDS.has(word)) {
          conceptTerms.add(word);
        }
      }
    }
  }

  // Extract meaningful terms from subtopic and title
  const metaText = `${card.subtopic ?? ''} ${card.title ?? ''}`;
  const normalizedMeta = normalizeToken(metaText);
  if (normalizedMeta) {
    // Also add 2-word phrases from subtopic
    const subtopicClean = normalizeToken(card.subtopic ?? '');
    if (subtopicClean.length >= 3) {
      conceptTerms.add(subtopicClean);
    }
    for (const word of normalizedMeta.split(/\s+/)) {
      if (word.length >= 3 && !STOP_WORDS.has(word)) {
        conceptTerms.add(word);
      }
    }
  }

  return {
    exactTags: Array.from(exactTags),
    conceptTerms: Array.from(conceptTerms),
  };
}

/**
 * Matches a Formula/Trap Vault card against the unified GateR + Arshan + Seed PYQ pool.
 *
 * Scoring rubric (within card's canonical subject, excluding removed 2027 topics):
 * - Exact tag match (`q.tags`) = +5 points
 * - Subtopic or title keyword match (`q.subtopic`, `q.title`) = +3 points
 * - Question body keyword match (`q.prompt` / stripped `bodyHtml`) = +1 point
 *
 * If 0 strict concept matches exist, cleanly falls back to the card's subject PYQs
 * and flags `usedSubjectFallback: true` with an honest `fallbackLabel`.
 */
export function findMatchingPyqsForVaultCard(
  card: VaultCard,
  allQuestions: Question[],
  attempts?: Record<string, QuestionAttemptRecord>,
  maxCount: number = 25
): VaultPyqMatchResult {
  const subjectPool = allQuestions.filter(
    (q) => q.subjectId === card.subject && !q.isOutOf2027Syllabus
  );

  const subjectName = SUBJECT_MAP[card.subject]?.shortName ?? card.subject.toUpperCase();

  if (subjectPool.length === 0) {
    return {
      questions: [],
      strictMatchCount: 0,
      usedSubjectFallback: true,
      fallbackLabel: `Showing ${subjectName} PYQs`,
    };
  }

  const { exactTags, conceptTerms } = extractCardKeywords(card);
  const scored: Array<{ q: Question; score: number; attempted: number; year: number }> = [];

  for (const q of subjectPool) {
    let score = 0;

    // 1. Exact tag matches (+5 each)
    const qTags = (q.tags ?? []).map((t) => t.trim().toLowerCase());
    if (qTags.length > 0) {
      const matchedTagHits = new Set<string>();
      for (const qt of qTags) {
        const qtSpaced = normalizeToken(qt);
        for (const target of exactTags) {
          if (qt === target || qtSpaced === target) {
            matchedTagHits.add(target);
          }
        }
      }
      score += matchedTagHits.size * 5;
    }

    // 2. Subtopic / title keyword matches (+3 each)
    const metaHaystack = normalizeToken(`${q.subtopic ?? ''} ${q.title ?? ''}`);
    if (metaHaystack) {
      for (const term of conceptTerms) {
        if (metaHaystack.includes(term)) {
          score += 3;
        }
      }
    }

    // 3. Question body keyword matches (+1 each)
    const bodyHaystack = `${(q.prompt ?? '').toLowerCase()} ${stripHtmlFast(q.bodyHtml)}`;
    if (bodyHaystack.trim()) {
      for (const term of conceptTerms) {
        if (term.length >= 3 && bodyHaystack.includes(term)) {
          score += 1;
        }
      }
    }

    if (score > 0) {
      scored.push({
        q,
        score,
        attempted: attempts?.[q.id] ? 1 : 0,
        year: q.year ?? 0,
      });
    }
  }

  if (scored.length > 0) {
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.attempted !== b.attempted) return a.attempted - b.attempted;
      return b.year - a.year;
    });

    const sliced = maxCount > 0 ? scored.slice(0, maxCount).map((s) => s.q) : scored.map((s) => s.q);
    return {
      questions: sliced,
      strictMatchCount: scored.length,
      usedSubjectFallback: false,
    };
  }

  // Honest fallback to the card's subject PYQs (prioritizing unattempted & newer)
  const fallbackSorted = [...subjectPool].sort((a, b) => {
    const aAtt = attempts?.[a.id] ? 1 : 0;
    const bAtt = attempts?.[b.id] ? 1 : 0;
    if (aAtt !== bAtt) return aAtt - bAtt;
    return (b.year ?? 0) - (a.year ?? 0);
  });

  const slicedFallback = maxCount > 0 ? fallbackSorted.slice(0, maxCount) : fallbackSorted;

  return {
    questions: slicedFallback,
    strictMatchCount: 0,
    usedSubjectFallback: true,
    fallbackLabel: `Showing ${subjectName} PYQs`,
  };
}
