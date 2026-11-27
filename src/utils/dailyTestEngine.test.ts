import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeDailyPoolStats,
  computeThreePhaseRoadmap,
  createEmptyDailyProgress,
  recordDailyTestCompletion,
  selectOrGetDailyDpp,
  selectOrGetDailyGa,
} from './dailyTestEngine.ts';
import {
  ACCENT_THEMES,
  VALID_ACCENT_THEMES,
  getActiveThemePalette,
  normalizeAccentThemeId,
  resolveEffectiveDarkMode,
} from './themeEngine.ts';
import { GATE_2027_SYLLABUS } from '../data/syllabus.ts';
import type { Question, SubjectId } from '../types/index.ts';

function makeMockQuestionBank(): Question[] {
  const coreSubjects: SubjectId[] = [
    'em',
    'dl',
    'coa',
    'cprog',
    'ds',
    'algo',
    'toc',
    'cd',
    'os',
    'dbms',
    'cn',
  ];
  const list: Question[] = [];

  for (const subj of coreSubjects) {
    for (let i = 1; i <= 4; i++) {
      list.push({
        id: `q-${subj}-${i}`,
        title: `${subj.toUpperCase()} PYQ #${i}`,
        subjectId: subj,
        subtopic: 'Core Topic',
        format: 'MCQ',
        marks: i % 2 === 0 ? 2 : 1,
        difficulty: 'Medium',
        sourceTag: `PYQ · GATE ${2020 + i}`,
        prompt: `Sample ${subj} question ${i}`,
        options: [
          { id: 'A', text: 'A' },
          { id: 'B', text: 'B' },
          { id: 'C', text: 'C' },
          { id: 'D', text: 'D' },
        ],
        correctOption: 'A',
        explanation: 'Explanation',
        wrongOptionAnalysis: '',
        isOutOf2027Syllabus: subj === 'cn' && i === 4,
      });
    }
  }

  // Add 12 GA questions (mixed 1M and 2M)
  for (let i = 1; i <= 12; i++) {
    list.push({
      id: `q-ga-${i}`,
      title: `GA PYQ #${i}`,
      subjectId: 'ga',
      subtopic: i % 2 === 0 ? 'Quantitative Aptitude' : 'Verbal Aptitude',
      format: 'MCQ',
      marks: i <= 5 ? 1 : 2,
      difficulty: 'Easy',
      sourceTag: `PYQ · GATE ${2015 + i}`,
      prompt: `Sample GA question ${i}`,
      options: [
        { id: 'A', text: 'A' },
        { id: 'B', text: 'B' },
        { id: 'C', text: 'C' },
        { id: 'D', text: 'D' },
      ],
      correctOption: 'B',
      explanation: 'GA explanation',
      wrongOptionAnalysis: '',
    });
  }

  return list;
}

describe('dailyTestEngine', () => {
  it('locks 10 unseen Daily DPP questions for the same IST date across reloads', () => {
    const bank = makeMockQuestionBank();
    const empty = createEmptyDailyProgress();

    const first = selectOrGetDailyDpp({
      todayIst: '2026-11-26',
      allQuestions: bank,
      dailyProgress: empty,
      syllabus: GATE_2027_SYLLABUS,
      progress: {},
      attempts: {},
      hideRemoved2027: true,
    });

    assert.equal(first.questions.length, 10);
    assert.equal(first.record.completed, false);
    assert.ok(!first.questions.some((q) => q.isOutOf2027Syllabus), 'Must exclude 2027 removed topics');
    assert.ok(!first.questions.some((q) => q.subjectId === 'ga'), 'Core DPP should prioritize core CS');

    // Second call on the same IST date returns exact locked IDs
    const second = selectOrGetDailyDpp({
      todayIst: '2026-11-26',
      allQuestions: bank,
      dailyProgress: first.updatedProgress,
      syllabus: GATE_2027_SYLLABUS,
      progress: {},
      attempts: {},
      hideRemoved2027: true,
    });

    assert.deepEqual(second.record.questionIds, first.record.questionIds);
  });

  it('never repeats DPP questions across consecutive IST days until the pool is exhausted', () => {
    const bank = makeMockQuestionBank(); // 43 valid core CS questions across 11 core subjects
    let dailyProgress = createEmptyDailyProgress();
    const seenAcrossDays = new Set<string>();

    // Days 1..4 => 40 unique questions with zero overlap
    const dates = ['2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29'];
    for (const date of dates) {
      const picked = selectOrGetDailyDpp({
        todayIst: date,
        allQuestions: bank,
        dailyProgress,
        syllabus: GATE_2027_SYLLABUS,
        progress: {},
        attempts: {},
        hideRemoved2027: true,
      });
      assert.equal(picked.questions.length, 10);
      assert.equal(picked.rolledOverPool, false);

      for (const q of picked.questions) {
        assert.ok(!seenAcrossDays.has(q.id), `Question ${q.id} repeated on ${date}`);
        seenAcrossDays.add(q.id);
      }

      dailyProgress = recordDailyTestCompletion({
        kind: 'dpp',
        todayIst: date,
        dailyProgress: picked.updatedProgress,
        questionIds: picked.record.questionIds,
        score: 12.67,
        maxMarks: picked.record.maxMarks,
        accuracy: 80,
        attemptedCount: 10,
        correctCount: 8,
      });
      assert.equal(dailyProgress.dailyDppByDate[date]?.completed, true);
    }

    assert.equal(seenAcrossDays.size, 40);
    assert.equal(dailyProgress.usedDailyDppIds.length, 40);

    // Day 5 has only 3 unseen remaining -> takes all 3 unseen + rolls over cleanly without intra-day duplicates
    const day5 = selectOrGetDailyDpp({
      todayIst: '2026-11-30',
      allQuestions: bank,
      dailyProgress,
      syllabus: GATE_2027_SYLLABUS,
      progress: {},
      attempts: {},
      hideRemoved2027: true,
    });
    assert.equal(day5.questions.length, 10);
    assert.equal(day5.rolledOverPool, true);
    assert.equal(new Set(day5.record.questionIds).size, 10);
  });

  it('selects 5 unseen Daily GA questions with never-repeating guarantee and completion tracking', () => {
    const bank = makeMockQuestionBank(); // 12 GA questions
    let dailyProgress = createEmptyDailyProgress();

    const day1 = selectOrGetDailyGa({
      todayIst: '2026-11-26',
      allQuestions: bank,
      dailyProgress,
      attempts: {},
    });
    assert.equal(day1.questions.length, 5);
    assert.ok(day1.questions.every((q) => q.subjectId === 'ga'));

    dailyProgress = recordDailyTestCompletion({
      kind: 'ga',
      todayIst: '2026-11-26',
      dailyProgress: day1.updatedProgress,
      questionIds: day1.record.questionIds,
      score: 7,
      maxMarks: day1.record.maxMarks,
      accuracy: 80,
      attemptedCount: 5,
      correctCount: 4,
      responses: { [day1.questions[0].id]: 'B' },
    });

    assert.equal(dailyProgress.dailyGaByDate['2026-11-26']?.completed, true);
    assert.equal(dailyProgress.usedDailyGaIds.length, 5);

    const day2 = selectOrGetDailyGa({
      todayIst: '2026-11-27',
      allQuestions: bank,
      dailyProgress,
      attempts: {},
    });
    assert.equal(day2.questions.length, 5);
    const day1Set = new Set(day1.record.questionIds);
    for (const q of day2.questions) {
      assert.ok(!day1Set.has(q.id), `GA question ${q.id} repeated on day 2`);
    }

    const stats = computeDailyPoolStats('ga', bank, dailyProgress, true);
    assert.equal(stats.totalEligible, 12);
    assert.equal(stats.usedCount, 5);
    assert.equal(stats.remainingUnseen, 7);
  });

  it('computes 3-phase 70-day roadmap accurately across phases', () => {
    const start = computeThreePhaseRoadmap(68);
    assert.equal(start.activePhase, 1);
    assert.equal(start.phases[0].status, 'active');
    assert.equal(start.phases[1].status, 'upcoming');

    const mid = computeThreePhaseRoadmap(30);
    assert.equal(mid.activePhase, 2);
    assert.equal(mid.phases[0].status, 'completed');
    assert.equal(mid.phases[1].status, 'active');

    const finalPhase = computeThreePhaseRoadmap(8);
    assert.equal(finalPhase.activePhase, 3);
    assert.equal(finalPhase.phases[0].status, 'completed');
    assert.equal(finalPhase.phases[1].status, 'completed');
    assert.equal(finalPhase.phases[2].status, 'active');
  });
});

describe('themeEngine', () => {
  it('provides all 8 curated themes with complete Light & Dark hex palettes and 5-step heatmaps', () => {
    assert.equal(ACCENT_THEMES.length, 8);
    assert.equal(VALID_ACCENT_THEMES.length, 8);

    const hexRegex = /^#[0-9A-Fa-f]{6}$/;
    for (const theme of ACCENT_THEMES) {
      for (const isDark of [false, true]) {
        const pal = getActiveThemePalette(theme.id, isDark);
        assert.match(pal.canvasBg, hexRegex);
        assert.match(pal.accentPrimary, hexRegex);
        assert.match(pal.accentSecondary, hexRegex);
        assert.equal(pal.heatmap.length, 5);
        for (const cell of pal.heatmap) {
          assert.match(cell, hexRegex);
        }
      }
    }
  });

  it('normalizes invalid accent IDs safely to Heritage brown and resolves dark mode correctly', () => {
    assert.equal(normalizeAccentThemeId('unknown-neon'), 'brown');
    assert.equal(normalizeAccentThemeId('navy'), 'navy');
    assert.equal(resolveEffectiveDarkMode('dark', false), true);
    assert.equal(resolveEffectiveDarkMode('light', true), false);
    assert.equal(resolveEffectiveDarkMode('system', true), true);
    assert.equal(resolveEffectiveDarkMode('system', false), false);
  });
});
