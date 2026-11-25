import type {
  ExamSettings,
  SubtopicProgress,
  WarRoomState,
} from '../types';
import { GATE_2027_SYLLABUS } from './syllabus';

export const DEFAULT_EXAM_SETTINGS: ExamSettings = {
  targetDateIso: '2027-02-06T09:30:00+05:30',
  shift: 'Forenoon (09:30 IST)',
  dailyGoalMinutes: 240,
  themeMode: 'light',
  uiScale: 'default',
  contentWidth: 'focused',
  pomodoroWorkMinutes: 50,
  pomodoroShortBreakMinutes: 10,
  pomodoroLongBreakMinutes: 25,
  timerChimeEnabled: true,
  autoHideRemoved2027: true,
  autoAddWrongToMistakes: true,
  showLivePaceTimer: true,
  enableKeyboardShortcuts: true,
};

export function createInitialProgress(): Record<string, SubtopicProgress> {
  const progress: Record<string, SubtopicProgress> = {};
  for (const subj of GATE_2027_SYLLABUS) {
    for (const sub of subj.subtopics) {
      progress[sub.id] = {
        status: 'not_started',
        confidence: 1,
        lastRevisedAt: null,
        notes: '',
      };
    }
  }
  return progress;
}

/**
 * Pure blank-slate factory for new users and reset flows.
 * Zero pre-filled mock data: all progress, logs, attempts, and mocks start at 0
 * and sync live with the user's Cloud Firestore workspace.
 */
export function createInitialWarRoomState(): WarRoomState {
  return {
    version: 2,
    theme: 'light',
    settings: { ...DEFAULT_EXAM_SETTINGS },
    lastAutopilotIstDate: '',
    lastTrapsIstDate: '',
    progress: createInitialProgress(),
    studyLogs: [],
    attempts: {},
    mistakes: {},
    verifiedAnswers: {},
    bookmarkedQuestions: [],
    savedSketches: {},
    traceTables: {},
    gaStreakLogs: {},
    customQuestions: [],
    bookmarkedTips: [],
    customTips: [],
    trapsVault: [],
    srsCards: {},
    mocks: [],
  };
}
