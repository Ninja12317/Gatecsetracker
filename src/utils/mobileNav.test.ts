import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MOBILE_BOTTOM_TABS,
  classifySwipeAxis,
  computePyqBottomFooterState,
  computeSwipeVisualOffset,
  evaluateSwipeCommit,
  getAdjacentSwipeTab,
  popHistoryEntry,
  pushHistoryEntry,
  shouldBypassSwipeTarget,
  shouldShowContextualBack,
  type NavHistoryEntry,
} from './mobileNav';

test('MOBILE_BOTTOM_TABS follows exact required order', () => {
  assert.deepEqual(
    MOBILE_BOTTOM_TABS.map((t) => t.id),
    ['dashboard', 'syllabus', 'pyq', 'focus', 'mocks', 'cslab', 'tips']
  );
  assert.deepEqual(
    MOBILE_BOTTOM_TABS.map((t) => t.label),
    ['Overview', 'Subjects', 'PYQ Studio', 'Focus', 'Mocks', 'CS Lab', 'Tips']
  );
});

test('getAdjacentSwipeTab respects boundary edges and transitions', () => {
  assert.equal(getAdjacentSwipeTab('dashboard', 'prev'), null);
  assert.equal(getAdjacentSwipeTab('dashboard', 'next')?.id, 'syllabus');
  assert.equal(getAdjacentSwipeTab('pyq', 'prev')?.id, 'syllabus');
  assert.equal(getAdjacentSwipeTab('pyq', 'next')?.id, 'focus');
  assert.equal(getAdjacentSwipeTab('tips', 'next'), null);
  assert.equal(getAdjacentSwipeTab('settings', 'next'), null);
});

test('classifySwipeAxis enforces strict horizontal lock (|dx| > 18 && |dx| > 1.5 * |dy|)', () => {
  assert.equal(classifySwipeAxis(15, 2).lock, 'pending');
  assert.equal(classifySwipeAxis(22, 16).lock, 'pending'); // 22 <= 1.5 * 16 = 24
  assert.equal(classifySwipeAxis(25, 16).lock, 'horizontal'); // 25 > 24
  assert.equal(classifySwipeAxis(-30, 10).lock, 'horizontal');
  assert.equal(classifySwipeAxis(8, 22).lock, 'vertical');
});

test('computeSwipeVisualOffset applies rubber-band resistance at first and last tabs', () => {
  const edge = computeSwipeVisualOffset(120, 'dashboard', 390);
  assert.equal(edge.edgeResist, true);
  assert.equal(edge.peekTab, null);
  assert.ok(edge.offsetX > 0 && edge.offsetX <= 44);

  const normal = computeSwipeVisualOffset(-90, 'dashboard', 390);
  assert.equal(normal.edgeResist, false);
  assert.equal(normal.peekTab?.id, 'syllabus');
  assert.ok(normal.offsetX < -40);
});

test('evaluateSwipeCommit commits on >22% viewport drag or >0.45 px/ms flick', () => {
  // Distance commit (95px > 22% of 390 = 85.8px)
  const distCommit = evaluateSwipeCommit({
    dx: -95,
    dy: 10,
    durationMs: 400,
    viewportWidth: 390,
    currentView: 'dashboard',
  });
  assert.equal(distCommit.shouldCommit, true);
  assert.equal(distCommit.targetTab?.id, 'syllabus');

  // Flick commit (50px in 80ms = 0.625 px/ms > 0.45)
  const flickCommit = evaluateSwipeCommit({
    dx: 50,
    dy: 5,
    durationMs: 80,
    viewportWidth: 390,
    currentView: 'pyq',
  });
  assert.equal(flickCommit.shouldCommit, true);
  assert.equal(flickCommit.targetTab?.id, 'syllabus');

  // Slow short drag should NOT commit
  const slowShort = evaluateSwipeCommit({
    dx: -45,
    dy: 5,
    durationMs: 500,
    viewportWidth: 390,
    currentView: 'dashboard',
  });
  assert.equal(slowShort.shouldCommit, false);
  assert.equal(slowShort.targetTab, null);
});

test('shouldBypassSwipeTarget ignores canvas, interactive svg, scrollable rails, inputs, and data-no-swipe', () => {
  assert.equal(shouldBypassSwipeTarget({ tagName: 'CANVAS' }), true);
  assert.equal(shouldBypassSwipeTarget({ tagName: 'INPUT' }), true);
  assert.equal(shouldBypassSwipeTarget({ tagName: 'TEXTAREA' }), true);
  assert.equal(shouldBypassSwipeTarget({ tagName: 'SELECT' }), true);
  assert.equal(
    shouldBypassSwipeTarget({
      tagName: 'DIV',
      getAttribute: (name) => (name === 'data-no-swipe' ? 'true' : null),
    }),
    true
  );
  // Horizontally scrollable sub-tab pill rail
  assert.equal(
    shouldBypassSwipeTarget({
      tagName: 'BUTTON',
      parentElement: {
        tagName: 'DIV',
        scrollWidth: 620,
        clientWidth: 360,
      },
    }),
    true
  );
  // Large interactive SVG / Recharts
  assert.equal(
    shouldBypassSwipeTarget({
      tagName: 'SVG',
      clientWidth: 320,
    }),
    true
  );
  // Tiny icon SVG inside normal card is allowed
  assert.equal(
    shouldBypassSwipeTarget({
      tagName: 'SVG',
      clientWidth: 16,
      parentElement: {
        tagName: 'DIV',
        scrollWidth: 360,
        clientWidth: 360,
      },
    }),
    false
  );
});

test('navigation history stack pushes deduplicated entries and pops cleanly back to Overview', () => {
  let stack: NavHistoryEntry[] = [{ view: 'dashboard' }];
  stack = pushHistoryEntry(stack, { view: 'syllabus' });
  stack = pushHistoryEntry(stack, { view: 'syllabus' }); // dedup
  assert.equal(stack.length, 2);

  stack = pushHistoryEntry(stack, { view: 'pyq', subContext: 'pyq:session' });
  assert.equal(stack.length, 3);

  const popped1 = popHistoryEntry(stack);
  assert.equal(popped1.target.view, 'syllabus');
  assert.equal(popped1.nextStack.length, 2);

  const popped2 = popHistoryEntry(popped1.nextStack);
  assert.equal(popped2.target.view, 'dashboard');
  assert.equal(popped2.nextStack.length, 1);

  assert.equal(shouldShowContextualBack('dashboard', false), false);
  assert.equal(shouldShowContextualBack('dashboard', true), true);
  assert.equal(shouldShowContextualBack('pyq', false), true);
});

test('computePyqBottomFooterState handles mid-test, last question, and time-up freeze', () => {
  const mid = computePyqBottomFooterState({
    currentIndex: 2,
    totalQuestions: 10,
    answeredCount: 3,
    isTimedMock: true,
    secondsRemaining: 420,
    finished: false,
  });
  assert.equal(mid.isLastQuestion, false);
  assert.equal(mid.isTimeUp, false);
  assert.equal(mid.isFrozen, false);
  assert.equal(mid.unansweredCount, 7);
  assert.equal(mid.needsSubmitConfirm, true);

  const last = computePyqBottomFooterState({
    currentIndex: 9,
    totalQuestions: 10,
    answeredCount: 10,
    isTimedMock: false,
    secondsRemaining: 0,
    finished: false,
  });
  assert.equal(last.isLastQuestion, true);
  assert.equal(last.isTimeUp, false);
  assert.equal(last.unansweredCount, 0);
  assert.equal(last.needsSubmitConfirm, false);

  const timeUp = computePyqBottomFooterState({
    currentIndex: 4,
    totalQuestions: 10,
    answeredCount: 4,
    isTimedMock: true,
    secondsRemaining: 0,
    finished: false,
  });
  assert.equal(timeUp.isTimeUp, true);
  assert.equal(timeUp.isFrozen, true);
  assert.equal(timeUp.needsSubmitConfirm, false);
});
