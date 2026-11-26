import type { NavView } from '../types';

export interface MobileBottomTabItem {
  id: NavView;
  label: string;
  shortLabel: string;
}

/**
 * Exact ordered rail for the floating curved mobile bottom navigation bar
 * and Instagram-style horizontal side-swipe tab switching.
 */
export const MOBILE_BOTTOM_TABS: readonly MobileBottomTabItem[] = [
  { id: 'dashboard', label: 'Overview', shortLabel: 'Overview' },
  { id: 'syllabus', label: 'Subjects', shortLabel: 'Subjects' },
  { id: 'pyq', label: 'PYQ Studio', shortLabel: 'PYQ Studio' },
  { id: 'focus', label: 'Focus', shortLabel: 'Focus' },
  { id: 'mocks', label: 'Mocks', shortLabel: 'Mocks' },
  { id: 'cslab', label: 'CS Lab', shortLabel: 'CS Lab' },
  { id: 'tips', label: 'Tips', shortLabel: 'Tips' },
] as const;

export const VIEW_HEADER_TITLES: Record<NavView, string> = {
  dashboard: "GATE '27",
  syllabus: 'Subjects',
  pyq: 'PYQ Studio',
  focus: 'Focus Studio',
  mocks: 'Mocks',
  cslab: 'CS Lab',
  tips: 'Daily Tips',
  revision: 'Revision',
  settings: 'Settings',
};

export function getMobileTabIndex(view: NavView): number {
  return MOBILE_BOTTOM_TABS.findIndex((t) => t.id === view);
}

/**
 * Returns the adjacent tab for a swipe gesture.
 * direction === 'next' means user swiped finger LEFT (dx < 0) -> advance to right tab.
 * direction === 'prev' means user swiped finger RIGHT (dx > 0) -> move to left tab.
 */
export function getAdjacentSwipeTab(
  currentView: NavView,
  direction: 'prev' | 'next'
): MobileBottomTabItem | null {
  const idx = getMobileTabIndex(currentView);
  if (idx === -1) return null;
  const targetIdx = direction === 'next' ? idx + 1 : idx - 1;
  if (targetIdx < 0 || targetIdx >= MOBILE_BOTTOM_TABS.length) return null;
  return MOBILE_BOTTOM_TABS[targetIdx];
}

export interface SwipeGestureInput {
  dx: number;
  dy: number;
  durationMs: number;
  viewportWidth: number;
  currentView: NavView;
}

export interface SwipeAxisDecision {
  lock: 'pending' | 'horizontal' | 'vertical';
}

/**
 * Strict directional axis lock:
 * Triggers horizontal tab swipe ONLY when |dx| > 18px AND |dx| > 1.5 * |dy|
 * so vertical page scrolling remains 100% crisp and unblocked.
 */
export function classifySwipeAxis(dx: number, dy: number): SwipeAxisDecision {
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  if (absX > 18 && absX > 1.5 * absY) {
    return { lock: 'horizontal' };
  }
  if (absY > 14 && absY >= absX) {
    return { lock: 'vertical' };
  }
  return { lock: 'pending' };
}

/**
 * Applies gentle rubber-band resistance when dragging past the first or last tab,
 * and caps normal drag offset smoothly for 60fps translate3d feedback.
 */
export function computeSwipeVisualOffset(
  dx: number,
  currentView: NavView,
  viewportWidth: number
): { offsetX: number; edgeResist: boolean; peekTab: MobileBottomTabItem | null } {
  const direction: 'prev' | 'next' = dx < 0 ? 'next' : 'prev';
  const adjacent = getAdjacentSwipeTab(currentView, direction);
  const maxTravel = Math.max(120, viewportWidth * 0.42);

  if (!adjacent) {
    // Gentle rubber-band resistance at boundary tabs (Overview left edge / Tips right edge)
    const damped = Math.sign(dx) * Math.min(44, Math.pow(Math.abs(dx), 0.72) * 1.4);
    return { offsetX: Math.round(damped * 10) / 10, edgeResist: true, peekTab: null };
  }

  const clamped = Math.max(-maxTravel, Math.min(maxTravel, dx * 0.65));
  return {
    offsetX: Math.round(clamped * 10) / 10,
    edgeResist: false,
    peekTab: Math.abs(dx) >= 24 ? adjacent : null,
  };
}

/**
 * Evaluates whether a completed horizontal drag should commit a tab transition.
 * Commits if |dx| > 22% of viewport width OR flick velocity > 0.45 px/ms.
 */
export function evaluateSwipeCommit(input: SwipeGestureInput): {
  shouldCommit: boolean;
  targetTab: MobileBottomTabItem | null;
  velocityPxPerMs: number;
} {
  const { dx, dy, durationMs, viewportWidth, currentView } = input;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  const safeDuration = Math.max(1, durationMs);
  const velocityPxPerMs = absX / safeDuration;

  if (absX <= 18 || absX <= 1.5 * absY) {
    return { shouldCommit: false, targetTab: null, velocityPxPerMs };
  }

  const direction: 'prev' | 'next' = dx < 0 ? 'next' : 'prev';
  const targetTab = getAdjacentSwipeTab(currentView, direction);
  if (!targetTab) {
    return { shouldCommit: false, targetTab: null, velocityPxPerMs };
  }

  const distanceThreshold = Math.max(64, viewportWidth * 0.22);
  const passesDistance = absX > distanceThreshold;
  const passesFlick = absX > 36 && velocityPxPerMs > 0.45;

  return {
    shouldCommit: passesDistance || passesFlick,
    targetTab: passesDistance || passesFlick ? targetTab : null,
    velocityPxPerMs,
  };
}

export interface SwipeTargetInspectionNode {
  tagName?: string;
  getAttribute?: (name: string) => string | null;
  classList?: { contains?: (cls: string) => boolean };
  scrollWidth?: number;
  clientWidth?: number;
  parentElement?: SwipeTargetInspectionNode | null;
}

const INTERACTIVE_INPUT_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'OPTION']);

/**
 * Pure DOM-walk touch-conflict guard.
 * Auto-bypasses horizontal tab swipes whenever touch starts inside:
 * - <canvas> (Sketchpad)
 * - interactive <svg> (TOC DFA/PDA Designer, Digital Logic, Code Flowchart, Recharts)
 * - Recharts chart wrapper (.recharts-wrapper)
 * - Horizontally scrollable containers (scrollWidth > clientWidth + 2, e.g. sub-tab rails, code blocks, trace tables, bottom nav)
 * - Form controls (<input>, <textarea>, <select>), open dialogs, or [data-no-swipe="true"]
 */
export function shouldBypassSwipeTarget(startNode: SwipeTargetInspectionNode | null): boolean {
  let node = startNode;
  let depth = 0;

  while (node && depth < 24) {
    const tag = (node.tagName ?? '').toUpperCase();

    if (INTERACTIVE_INPUT_TAGS.has(tag)) return true;
    if (tag === 'CANVAS') return true;
    if (tag === 'PRE' || tag === 'TABLE') return true;

    // Interactive SVG (charts, diagrams, visualizers) — ignore tiny lucide UI icons (<= 32px)
    if (tag === 'SVG') {
      const w = node.clientWidth ?? 0;
      const role = node.getAttribute?.('role') ?? '';
      const interactive = node.getAttribute?.('data-interactive-svg') === 'true';
      if (interactive || w > 48 || role === 'application' || role === 'img') {
        return true;
      }
    }

    if (node.getAttribute?.('data-no-swipe') === 'true') return true;
    if (node.getAttribute?.('role') === 'dialog' || node.getAttribute?.('aria-modal') === 'true') {
      return true;
    }
    if (node.classList?.contains?.('recharts-wrapper') || node.classList?.contains?.('recharts-surface')) {
      return true;
    }

    // Any horizontally scrollable container (sub-tab pill rails, code blocks, tables, bottom nav)
    const sw = node.scrollWidth ?? 0;
    const cw = node.clientWidth ?? 0;
    if (cw > 0 && sw > cw + 4 && tag !== 'HTML' && tag !== 'BODY' && tag !== 'MAIN') {
      return true;
    }

    node = node.parentElement ?? null;
    depth += 1;
  }

  return false;
}

/**
 * Pure navigation history entry supporting tabs + nested views
 * for contextual Back Arrow (←) and Android hardware/gesture back sync.
 */
export interface NavHistoryEntry {
  view: NavView;
  subContext?: string; // e.g., 'subject:os', 'pyq:session', 'pyq:mistakes', 'pyq:resources', 'cslab:coa'
  label?: string;
}

export function isSameHistoryEntry(a: NavHistoryEntry, b: NavHistoryEntry): boolean {
  return a.view === b.view && (a.subContext ?? '') === (b.subContext ?? '');
}

export function pushHistoryEntry(
  stack: NavHistoryEntry[],
  next: NavHistoryEntry,
  maxDepth = 30
): NavHistoryEntry[] {
  const current = stack[stack.length - 1];
  if (current && isSameHistoryEntry(current, next)) {
    return stack;
  }
  const updated = [...stack, next];
  return updated.length > maxDepth ? updated.slice(updated.length - maxDepth) : updated;
}

export function popHistoryEntry(stack: NavHistoryEntry[]): {
  nextStack: NavHistoryEntry[];
  target: NavHistoryEntry;
} {
  if (stack.length <= 1) {
    const root: NavHistoryEntry = { view: 'dashboard' };
    return { nextStack: [root], target: root };
  }
  const nextStack = stack.slice(0, -1);
  return { nextStack, target: nextStack[nextStack.length - 1] };
}

export function shouldShowContextualBack(
  activeView: NavView,
  hasNestedView: boolean
): boolean {
  return activeView !== 'dashboard' || hasNestedView;
}

export interface PyqBottomFooterState {
  isLastQuestion: boolean;
  isFirstQuestion: boolean;
  isTimeUp: boolean;
  isFrozen: boolean;
  answeredCount: number;
  unansweredCount: number;
  totalQuestions: number;
  needsSubmitConfirm: boolean;
}

/**
 * Pure state calculator for the PYQ active test / sprint sticky bottom bar.
 */
export function computePyqBottomFooterState(params: {
  currentIndex: number;
  totalQuestions: number;
  answeredCount: number;
  isTimedMock: boolean;
  secondsRemaining: number;
  finished: boolean;
}): PyqBottomFooterState {
  const total = Math.max(0, params.totalQuestions);
  const answered = Math.max(0, Math.min(total, params.answeredCount));
  const unanswered = Math.max(0, total - answered);
  const isFirstQuestion = params.currentIndex <= 0;
  const isLastQuestion = total > 0 && params.currentIndex >= total - 1;
  const isTimeUp = params.isTimedMock && !params.finished && params.secondsRemaining <= 0;

  return {
    isLastQuestion,
    isFirstQuestion,
    isTimeUp,
    isFrozen: isTimeUp || params.finished,
    answeredCount: answered,
    unansweredCount: unanswered,
    totalQuestions: total,
    needsSubmitConfirm: !isTimeUp && unanswered > 0,
  };
}
