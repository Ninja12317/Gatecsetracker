import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { ArrowLeft, ArrowRight, AlertTriangle } from 'lucide-react';
import type { NavView, PdfExportRequest, Question, SubjectId, VaultCard } from './types';
import { useWarRoomStore } from './hooks/useWarRoomStore';
import {
  computeStudyStreak,
  needsSpacedRevision,
  toLocalIsoDate,
} from './utils/gateMath';
import { isSrsCardDueToday, makeSrsCardId } from './utils/examPolish';
import { matchPyqsForVaultCard } from './utils/vaultImporter';
import {
  SIMPLE_MODE_CORE_TABS,
  VIEW_HEADER_TITLES,
  popHistoryEntry,
  pushHistoryEntry,
  shouldShowContextualBack,
  type NavHistoryEntry,
} from './utils/mobileNav';
import { normalizeAccentThemeId } from './utils/themeEngine';
import { GATE_2027_SYLLABUS, SUBJECT_MAP } from './data/syllabus';
import { TopBar } from './components/TopBar';
import { MobileBottomNav } from './components/MobileBottomNav';
import { SlideOverDrawer } from './components/SlideOverDrawer';
import { DashboardView } from './components/DashboardView';
import { FocusStudioView } from './components/FocusStudioView';
import { FloatingFocusMiniPill } from './components/FloatingFocusMiniPill';
import { SyllabusView } from './components/SyllabusView';
import { PyqStudioView } from './components/PyqStudioView';
import { CsLabView } from './components/CsLabView';
import { RapidRevisionView } from './components/RapidRevisionView';
import { TipsVaultView } from './components/TipsVaultView';
import { MockAnalyticsView } from './components/MockAnalyticsView';
import { SettingsView } from './components/SettingsView';
import { CalculatorDrawer } from './components/CalculatorDrawer';
import { StandaloneSketchpadModal } from './components/StandaloneSketchpadModal';
import { CommandPalette } from './components/CommandPalette';
import { InfoModal } from './components/InfoModal';
import { PdfExportModal } from './components/PdfExportModal';
import { VectorPrintSheet, type ActivePrintJob } from './components/VectorPrintSheet';
import { PwaInstallModal, OfflineStatusBanner } from './components/PwaInstallModal';
import { usePwaInstall } from './hooks/usePwaInstall';
import { useSwipeTabNavigation } from './hooks/useSwipeTabNavigation';
import { FocusTimerProvider } from './context/FocusTimerContext';

const VALID_TABS: NavView[] = [
  'dashboard',
  'focus',
  'syllabus',
  'pyq',
  'cslab',
  'revision',
  'tips',
  'mocks',
  'settings',
];

function getInitialViewFromUrl(): NavView {
  if (typeof window === 'undefined') return 'dashboard';
  const params = new URLSearchParams(window.location.search);
  const tab = params.get('tab') as NavView | null;
  if (tab && VALID_TABS.includes(tab)) {
    return tab;
  }
  return 'dashboard';
}

export default function App() {
  const store = useWarRoomStore();
  const pwa = usePwaInstall();
  const [activeView, setActiveView] = useState<NavView>(() => getInitialViewFromUrl());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [zenMode, setZenMode] = useState(false);
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const [standaloneSketchpadOpen, setStandaloneSketchpadOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [infoModalOpen, setInfoModalOpen] = useState(false);
  const [pdfModalRequest, setPdfModalRequest] = useState<PdfExportRequest | null>(null);
  const [activePrintJob, setActivePrintJob] = useState<ActivePrintJob | null>(null);
  const [pdfToast, setPdfToast] = useState<string>('');
  const [focusedSubjectId, setFocusedSubjectId] = useState<SubjectId | null>(null);
  const [autoStartDppTrigger, setAutoStartDppTrigger] = useState(0);
  const [autoReviewDppTrigger, setAutoReviewDppTrigger] = useState(0);
  const [autoStartGaSprintTrigger, setAutoStartGaSprintTrigger] = useState(0);
  const [autoReviewGaTrigger, setAutoReviewGaTrigger] = useState(0);
  const [openMistakesTrigger, setOpenMistakesTrigger] = useState(0);
  const [launchSketchpadSprintTrigger, setLaunchSketchpadSprintTrigger] = useState(0);
  const [exitPyqSessionTrigger, setExitPyqSessionTrigger] = useState(0);
  const [resetPyqStudioTabTrigger, setResetPyqStudioTabTrigger] = useState(0);
  const [vaultDrillRequest, setVaultDrillRequest] = useState<{
    nonce: number;
    title: string;
    questions: Question[];
  } | null>(null);
  const [confirmExitTimedTestOpen, setConfirmExitTimedTestOpen] = useState(false);

  const [pyqSessionInfo, setPyqSessionInfo] = useState<{
    active: boolean;
    isTimed: boolean;
    finished: boolean;
    title: string;
    sketchpadOpen: boolean;
    studioTab: 'practice' | 'mistakes' | 'resources';
  }>({
    active: false,
    isTimed: false,
    finished: false,
    title: '',
    sketchpadOpen: false,
    studioTab: 'practice',
  });

  // Navigation history stack synced with window.history for Android hardware/gesture back & contextual TopBar ←
  const [historyStack, setHistoryStack] = useState<NavHistoryEntry[]>(() => [
    { view: getInitialViewFromUrl() },
  ]);
  const historyStackRef = useRef<NavHistoryEntry[]>(historyStack);
  historyStackRef.current = historyStack;

  const navigateTo = useCallback(
    (view: NavView, opts?: { subContext?: string; label?: string; skipPushState?: boolean }) => {
      setActiveView(view);
      if (view !== 'syllabus' && !opts?.subContext?.startsWith('subject:')) {
        setFocusedSubjectId(null);
      }
      if (view !== 'pyq') {
        setPyqSessionInfo((prev) =>
          prev.active ? { ...prev, active: false, finished: false, sketchpadOpen: false } : prev
        );
      }
      const nextEntry: NavHistoryEntry = {
        view,
        subContext: opts?.subContext,
        label: opts?.label,
      };
      setHistoryStack((prev) => pushHistoryEntry(prev, nextEntry));
      if (!opts?.skipPushState && typeof window !== 'undefined') {
        try {
          window.history.pushState({ warRoomNav: true, entry: nextEntry }, '');
        } catch {
          // Safe fallback in sandboxed iframes
        }
      }
    },
    []
  );

  // Auto-exit Zen Fullscreen Mode whenever leaving PYQ Studio
  useEffect(() => {
    if (activeView !== 'pyq' && zenMode) {
      setZenMode(false);
    }
  }, [activeView, zenMode]);

  // Clear temporary print root after native browser print dialog finishes
  useEffect(() => {
    const onAfterPrint = () => {
      setActivePrintJob(null);
    };
    window.addEventListener('afterprint', onAfterPrint);
    return () => window.removeEventListener('afterprint', onAfterPrint);
  }, []);

  const handleTriggerPrint = useCallback((job: ActivePrintJob) => {
    setActivePrintJob(job);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try {
          window.print();
        } catch {
          // Handled via modal's Direct .PDF Download engine
        }
      });
    });
  }, []);

  const handlePdfDownloadSuccess = useCallback((msg: string) => {
    setPdfToast(msg);
    window.setTimeout(() => {
      setPdfToast((curr) => (curr === msg ? '' : curr));
    }, 4500);
  }, []);

  // Global keyboard shortcuts (Cmd/Ctrl+K, C for Calculator outside inputs, Escape)
  useEffect(() => {
    const shortcutsEnabled = store.state.settings.enableKeyboardShortcuts ?? true;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setCommandPaletteOpen(false);
        setInfoModalOpen(false);
        setDrawerOpen(false);
        setPdfModalRequest(null);
        setStandaloneSketchpadOpen(false);
        return;
      }
      if (!shortcutsEnabled) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((open) => !open);
        return;
      }
      // Global Calculator shortcut 'C' when not in PYQ view (PyqCbtSession handles its own 'C') and not typing
      if (
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        e.key.toLowerCase() === 'c' &&
        activeView !== 'pyq'
      ) {
        const target = e.target as HTMLElement | null;
        if (
          target &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.tagName === 'SELECT' ||
            target.isContentEditable)
        ) {
          return;
        }
        e.preventDefault();
        setCalculatorOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [store.state.settings.enableKeyboardShortcuts, activeView]);

  const unresolvedMistakesCount = useMemo(
    () => Object.values(store.state.mistakes).filter((m) => !m.resolved).length,
    [store.state.mistakes]
  );

  const revisionDueCount = useMemo(() => {
    const allSubs = GATE_2027_SYLLABUS.flatMap((s) => s.subtopics);
    return allSubs.filter((sub) => needsSpacedRevision(store.state.progress[sub.id])).length;
  }, [store.state.progress]);

  const srsDueCount = useMemo(() => {
    const todayIso = toLocalIsoDate();
    let count = 0;
    for (const m of Object.values(store.state.mistakes)) {
      if (m.resolved) continue;
      const cardId = makeSrsCardId('mistake', m.questionId);
      if (isSrsCardDueToday(store.state.srsCards[cardId], todayIso)) count += 1;
    }
    const sampleTips = [
      ...store.state.trapsVault,
      ...store.state.customTips,
      ...store.allTips.filter((t) => store.state.bookmarkedTips.includes(t.id)),
      ...store.allTips.slice(0, 12),
    ];
    const seen = new Set<string>();
    for (const t of sampleTips) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      const cardId = makeSrsCardId('trap', t.id);
      if (isSrsCardDueToday(store.state.srsCards[cardId], todayIso)) count += 1;
    }
    return count;
  }, [
    store.state.mistakes,
    store.state.srsCards,
    store.state.trapsVault,
    store.state.customTips,
    store.state.bookmarkedTips,
    store.allTips,
  ]);

  const streakDays = useMemo(
    () => computeStudyStreak(store.state.studyLogs, toLocalIsoDate()),
    [store.state.studyLogs]
  );

  const handleJumpToSubject = useCallback(
    (subjectId: SubjectId) => {
      setFocusedSubjectId(subjectId);
      navigateTo('syllabus', {
        subContext: `subject:${subjectId}`,
        label: SUBJECT_MAP[subjectId]?.shortName ?? 'Subject',
      });
    },
    [navigateTo]
  );

  const handleLaunchDailyDpp = useCallback(() => {
    navigateTo('pyq', { subContext: 'pyq:dpp', label: 'Daily Mixed DPP' });
    setAutoStartDppTrigger((n) => n + 1);
  }, [navigateTo]);

  const handleReviewDailyDpp = useCallback(() => {
    navigateTo('pyq', { subContext: 'pyq:dpp-review', label: 'Daily DPP Review' });
    setAutoReviewDppTrigger((n) => n + 1);
  }, [navigateTo]);

  const handleLaunchGaSprint = useCallback(() => {
    navigateTo('pyq', { subContext: 'pyq:ga', label: 'Daily GA Test' });
    setAutoStartGaSprintTrigger((n) => n + 1);
  }, [navigateTo]);

  const handleReviewGaSprint = useCallback(() => {
    navigateTo('pyq', { subContext: 'pyq:ga-review', label: 'Daily GA Review' });
    setAutoReviewGaTrigger((n) => n + 1);
  }, [navigateTo]);

  const handleToggleSimpleMode = useCallback(
    (enabled: boolean) => {
      store.setSimpleMode(enabled);
      if (
        enabled &&
        activeView !== 'settings' &&
        !(SIMPLE_MODE_CORE_TABS as readonly NavView[]).includes(activeView)
      ) {
        navigateTo('dashboard');
      }
    },
    [store, activeView, navigateTo]
  );

  const handleOpenMistakesBucket = useCallback(() => {
    navigateTo('pyq', { subContext: 'pyq:mistakes', label: 'Mistake Bucket' });
    setOpenMistakesTrigger((n) => n + 1);
  }, [navigateTo]);

  const handleJumpToFocusTimer = useCallback(() => {
    navigateTo('focus');
  }, [navigateTo]);

  const handleDrillMatchingPyqs = useCallback(
    (card: VaultCard) => {
      const matched = matchPyqsForVaultCard(card, store.allQuestions, 12);
      if (matched.length === 0) {
        handlePdfDownloadSuccess('No matching PYQs found in bank for this topic yet.');
        return;
      }
      const subjCode = SUBJECT_MAP[card.subject]?.code ?? card.subject.toUpperCase();
      setVaultDrillRequest({
        nonce: Date.now(),
        title: `${subjCode} Vault Drill · ${card.subtopic}`,
        questions: matched,
      });
      navigateTo('pyq', { subContext: `pyq:vault_${card.subject}`, label: `${subjCode} Drill` });
    },
    [store.allQuestions, navigateTo, handlePdfDownloadSuccess]
  );

  const handlePyqSessionStateChange = useCallback(
    (info: {
      active: boolean;
      isTimed: boolean;
      finished: boolean;
      title: string;
      sketchpadOpen: boolean;
      studioTab: 'practice' | 'mistakes' | 'resources';
    }) => {
      setPyqSessionInfo((prev) => {
        if (
          prev.active === info.active &&
          prev.isTimed === info.isTimed &&
          prev.finished === info.finished &&
          prev.title === info.title &&
          prev.sketchpadOpen === info.sketchpadOpen &&
          prev.studioTab === info.studioTab
        ) {
          return prev;
        }
        return info;
      });
    },
    []
  );

  // Contextual Back Arrow & Android hardware/gesture back handler
  const handleContextualBack = useCallback(
    (fromPopstate = false) => {
      // 1. Protect active unfinished timed PYQ test with a clean confirmation dialog
      if (activeView === 'pyq' && pyqSessionInfo.active && !pyqSessionInfo.finished && pyqSessionInfo.isTimed) {
        if (fromPopstate && typeof window !== 'undefined') {
          try {
            window.history.pushState({ warRoomNav: true, guard: 'timed-test' }, '');
          } catch {
            // ignore
          }
        }
        setConfirmExitTimedTestOpen(true);
        return;
      }

      // 2. Exit active practice sprint or finished score report back to Test Builder
      if (activeView === 'pyq' && pyqSessionInfo.active) {
        setExitPyqSessionTrigger((n) => n + 1);
        return;
      }

      // 3. Return from PYQ Mistakes or Importers sub-tab back to Test Builder
      if (activeView === 'pyq' && pyqSessionInfo.studioTab !== 'practice') {
        setResetPyqStudioTabTrigger((n) => n + 1);
        return;
      }

      // 4. Clear focused subject inside Syllabus back to full 11-subject list
      if (activeView === 'syllabus' && focusedSubjectId) {
        setFocusedSubjectId(null);
        return;
      }

      // 5. Pop internal history stack cleanly (falls back to Overview)
      const { nextStack, target } = popHistoryEntry(historyStackRef.current);
      setHistoryStack(nextStack);
      setActiveView(target.view);
      if (target.subContext?.startsWith('subject:')) {
        setFocusedSubjectId(target.subContext.replace('subject:', '') as SubjectId);
      } else {
        setFocusedSubjectId(null);
      }
    },
    [activeView, pyqSessionInfo, focusedSubjectId]
  );

  // Sync Android hardware/gesture back button (`popstate`) cleanly
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onPopState = () => {
      if (drawerOpen) {
        setDrawerOpen(false);
        return;
      }
      if (calculatorOpen) {
        setCalculatorOpen(false);
        return;
      }
      if (commandPaletteOpen) {
        setCommandPaletteOpen(false);
        return;
      }
      if (infoModalOpen) {
        setInfoModalOpen(false);
        return;
      }
      if (standaloneSketchpadOpen) {
        setStandaloneSketchpadOpen(false);
        return;
      }
      if (pdfModalRequest) {
        setPdfModalRequest(null);
        return;
      }
      if (activeView !== 'dashboard' || focusedSubjectId || pyqSessionInfo.active || pyqSessionInfo.studioTab !== 'practice') {
        handleContextualBack(true);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [
    activeView,
    focusedSubjectId,
    pyqSessionInfo,
    drawerOpen,
    calculatorOpen,
    standaloneSketchpadOpen,
    commandPaletteOpen,
    infoModalOpen,
    pdfModalRequest,
    handleContextualBack,
  ]);

  const handleExportStudyReportPdf = useCallback(() => {
    setPdfModalRequest({
      kind: 'study-report',
      title: 'GATE CSE 2027 · 70-Day Study & Readiness Report',
    });
  }, []);

  const handleExportMockReportPdf = useCallback(() => {
    setPdfModalRequest({
      kind: 'mock-report',
      title: 'GATE CSE 2027 · Mock Test Analytics & Diagnostics',
    });
  }, []);

  const simpleMode = Boolean(store.state.settings.simpleMode);
  const accentTheme = normalizeAccentThemeId(store.state.settings.accentTheme);
  const contentWidth = store.state.settings.contentWidth ?? 'standard';
  const containerMaxWidth = contentWidth === 'wide' ? 'max-w-[1536px]' : 'max-w-[1280px]';
  const hideChrome = zenMode && activeView === 'pyq';
  const isActivePyqTest = activeView === 'pyq' && pyqSessionInfo.active && !pyqSessionInfo.finished;
  const hasNestedView =
    Boolean(focusedSubjectId) ||
    (activeView === 'pyq' && (pyqSessionInfo.active || pyqSessionInfo.studioTab !== 'practice'));
  const showContextualBack = shouldShowContextualBack(activeView, hasNestedView);

  // If Simple Mode syncs ON from Firestore while on a hidden secondary tab, cleanly return to Overview
  useEffect(() => {
    if (
      simpleMode &&
      activeView !== 'settings' &&
      !(SIMPLE_MODE_CORE_TABS as readonly NavView[]).includes(activeView)
    ) {
      setActiveView('dashboard');
    }
  }, [simpleMode, activeView]);

  const mobileHeaderTitle = useMemo(() => {
    if (activeView === 'pyq') {
      if (pyqSessionInfo.active) {
        return pyqSessionInfo.finished ? 'Score Report' : pyqSessionInfo.title || 'PYQ Sprint';
      }
      if (pyqSessionInfo.studioTab === 'mistakes') return 'Mistake Bucket';
      if (pyqSessionInfo.studioTab === 'resources') return 'PYQ Importers';
      return 'PYQ Studio';
    }
    if (activeView === 'syllabus' && focusedSubjectId) {
      return SUBJECT_MAP[focusedSubjectId]?.shortName ?? 'Subjects';
    }
    return VIEW_HEADER_TITLES[activeView] ?? "GATE '27";
  }, [activeView, pyqSessionInfo, focusedSubjectId]);

  const anyModalOrOverlayOpen =
    drawerOpen ||
    calculatorOpen ||
    standaloneSketchpadOpen ||
    commandPaletteOpen ||
    infoModalOpen ||
    Boolean(pdfModalRequest) ||
    pwa.guideOpen ||
    confirmExitTimedTestOpen;

  const swipe = useSwipeTabNavigation({
    activeView,
    enabled: store.state.settings.enableMobileSwipeNav ?? true,
    disabled: hideChrome || isActivePyqTest || pyqSessionInfo.sketchpadOpen || anyModalOrOverlayOpen,
    simpleMode,
    onSelectTab: (nextView) => navigateTo(nextView),
  });

  const hideMobileBottomNav =
    hideChrome ||
    isActivePyqTest ||
    pyqSessionInfo.sketchpadOpen ||
    anyModalOrOverlayOpen ||
    swipe.isKeyboardOpen;

  return (
    <FocusTimerProvider
      settings={store.state.settings}
      studyLogs={store.state.studyLogs}
      onLogStudySession={store.logStudySession}
      onUpdateStudyLog={store.updateStudyLog}
    >
      <div className="no-print min-h-screen flex flex-col bg-[#FAF8F4] text-[#1C1613] dark:bg-[#130F0D] dark:text-[#F5F0E8]">
        <OfflineStatusBanner isOnline={pwa.isOnline} />
        {!hideChrome && (
          <TopBar
            activeView={activeView}
            contentWidth={contentWidth}
            simpleMode={simpleMode}
            user={store.user}
            syncStatus={store.syncStatus}
            quotaNotice={store.quotaNotice}
            unresolvedMistakesCount={unresolvedMistakesCount}
            revisionDueCount={revisionDueCount}
            showBackButton={showContextualBack}
            mobileTitle={mobileHeaderTitle}
            onBack={() => handleContextualBack(false)}
            onSelectView={(v) => navigateTo(v)}
            onSignInGoogle={store.signInWithGoogle}
            onOpenCommandPalette={() => setCommandPaletteOpen(true)}
            onOpenDrawer={() => setDrawerOpen(true)}
          />
        )}

        {/* Instagram-Style Edge Peek Hint Pill during Active Horizontal Mobile Swipe */}
        {swipe.peekTab && swipe.peekSide && (
          <div
            aria-hidden="true"
            data-testid="mobile-swipe-peek-pill"
            className={`md:hidden fixed top-1/2 -translate-y-1/2 z-40 pointer-events-none px-3.5 py-2 rounded-full bg-[#241914]/90 dark:bg-[#E0A92E] text-[#FAF8F4] dark:text-[#1C1613] text-xs font-bold shadow-warm-lg inline-flex items-center gap-1.5 backdrop-blur-sm ${
              swipe.peekSide === 'left' ? 'left-3' : 'right-3'
            }`}
          >
            {swipe.peekSide === 'left' && <ArrowLeft className="h-3.5 w-3.5" />}
            <span>{swipe.peekTab.label}</span>
            {swipe.peekSide === 'right' && <ArrowRight className="h-3.5 w-3.5" />}
          </div>
        )}

        <main
          {...swipe.touchHandlers}
          style={
            swipe.dragOffsetX !== 0 || swipe.isSnapping
              ? {
                  transform: `translate3d(${swipe.dragOffsetX}px, 0, 0)`,
                  transition: swipe.isSnapping
                    ? 'transform 260ms cubic-bezier(0.22, 1, 0.36, 1)'
                    : 'none',
                  willChange: 'transform',
                }
              : undefined
          }
          className={`flex-1 w-full ${containerMaxWidth} mx-auto px-4 sm:px-6 overflow-x-clip ${
            hideChrome ? 'py-4' : 'py-5 sm:py-8'
          }`}
        >
          {activeView === 'dashboard' && (
            <DashboardView
              state={store.state}
              allQuestions={store.allQuestions}
              syncStatus={store.syncStatus}
              allTips={store.allTips}
              totalPyqCount={store.allQuestions.length}
              simpleMode={simpleMode}
              autopilotLoading={store.autopilotLoading}
              autopilotStatusMsg={store.autopilotStatusMsg}
              urlIngestLoading={store.urlIngestLoading}
              onRunDailyAutopilot={store.runDailyAutopilot}
              onIngestPublicUrl={store.ingestPublicUrl}
              onNavigate={(v) => navigateTo(v)}
              onJumpToSubject={handleJumpToSubject}
              onLaunchDailyDpp={handleLaunchDailyDpp}
              onReviewDailyDpp={handleReviewDailyDpp}
              onLaunchGaSprint={handleLaunchGaSprint}
              onReviewGaSprint={handleReviewGaSprint}
              onOpenStandaloneSketchpad={() => setStandaloneSketchpadOpen(true)}
              onOpenCommandPalette={() => setCommandPaletteOpen(true)}
            />
          )}

          {activeView === 'focus' && (
            <FocusStudioView
              studyLogs={store.state.studyLogs}
              dailyGoalMinutes={store.state.settings.dailyGoalMinutes}
              theme={store.state.theme}
              accentTheme={accentTheme}
              simpleMode={simpleMode}
              keyboardShortcutsEnabled={store.state.settings.enableKeyboardShortcuts ?? true}
              onUpdateStudyLog={store.updateStudyLog}
              onDeleteStudyLog={store.deleteStudyLog}
            />
          )}

          {activeView === 'syllabus' && (
            <SyllabusView
              progress={store.state.progress}
              focusedSubjectId={focusedSubjectId}
              onClearFocusedSubject={() => setFocusedSubjectId(null)}
              onCycleStatus={store.cycleSubtopicStatus}
              onSetConfidence={store.setSubtopicConfidence}
              onMarkRevised={store.markSubtopicRevised}
              onSaveNotes={store.saveSubtopicNotes}
            />
          )}

          {activeView === 'pyq' && (
            <PyqStudioView
              state={store.state}
              allQuestions={store.allQuestions}
              simpleMode={simpleMode}
              autoStartDppTrigger={autoStartDppTrigger}
              autoReviewDppTrigger={autoReviewDppTrigger}
              autoStartGaSprintTrigger={autoStartGaSprintTrigger}
              autoReviewGaTrigger={autoReviewGaTrigger}
              openMistakesTrigger={openMistakesTrigger}
              launchSketchpadSprintTrigger={launchSketchpadSprintTrigger}
              onGetOrCreateTodayDailyDpp={store.getOrCreateTodayDailyDpp}
              onCompleteDailyDpp={store.completeTodayDailyDpp}
              onGetOrCreateTodayDailyGa={store.getOrCreateTodayDailyGa}
              onCompleteDailyGa={store.completeTodayDailyGa}
              gaterSyncStatus={store.gaterSyncStatus}
              gaterCount={store.gaterCount}
              arshanCount={store.arshanCount}
              enrichedCount={store.enrichedCount}
              verifiedBankCount={store.verifiedBankCount}
              syncProgressMsg={store.syncProgressMsg}
              gaterSyncedAt={store.gaterSyncedAt}
              gaterError={store.gaterError}
              subjectFetching={store.subjectFetching}
              subjectCooldownUntil={store.subjectCooldownUntil}
              urlIngestLoading={store.urlIngestLoading}
              quotaNotice={store.quotaNotice}
              onResyncGateR={() => store.syncAllRepos(true)}
              onNotify={handlePdfDownloadSuccess}
              onSaveVerifiedAnswer={store.saveVerifiedAnswer}
              onVerifySinglePyq={store.verifySinglePyqWithAi}
              onFetchSubjectPyqs={store.fetchMoreSubjectPyqs}
              onIngestPublicUrl={store.ingestPublicUrl}
              onRecordAttempt={store.recordQuestionAttempt}
              onToggleBookmark={store.toggleQuestionBookmark}
              onUpdateMistakeTag={store.updateMistakeTag}
              onUpdateMistakeNote={store.updateMistakeNote}
              onToggleMistakeResolved={store.toggleMistakeResolved}
              onSaveSketch={store.saveSketchForQuestion}
              onDeleteSketch={store.deleteSketchForQuestion}
              onSaveTraceTable={store.saveTraceTable}
              onDeleteTraceTable={store.deleteTraceTable}
              onCompleteGaSprint={store.recordGaSprintCompletion}
              onImportQuestions={store.addImportedQuestions}
              onToggleCalculator={() => setCalculatorOpen((o) => !o)}
              zenMode={zenMode}
              onToggleZenMode={() => setZenMode((z) => !z)}
              onRequestPdfExport={setPdfModalRequest}
              onSessionStateChange={handlePyqSessionStateChange}
              exitSessionTrigger={exitPyqSessionTrigger}
              resetStudioTabTrigger={resetPyqStudioTabTrigger}
              vaultDrillRequest={vaultDrillRequest}
            />
          )}

          {activeView === 'cslab' && (
            <CsLabView
              standaloneTraceTable={store.state.traceTables['cs_lab_sandbox']}
              onSaveTraceTable={store.saveTraceTable}
              onDeleteTraceTable={store.deleteTraceTable}
            />
          )}

          {activeView === 'revision' && (
            <RapidRevisionView
              state={store.state}
              allQuestions={store.allQuestions}
              allTips={store.allTips}
              onRecordSrsRating={store.recordSrsRating}
              onGoToPyq={() => navigateTo('pyq')}
            />
          )}

          {activeView === 'tips' && (
            <TipsVaultView
              allVaultCards={store.allVaultCards}
              vaultPacks={store.state.vaultPacks}
              bookmarkedTips={store.state.bookmarkedTips}
              unresolvedMistakesCount={unresolvedMistakesCount}
              onToggleBookmark={store.toggleTipBookmark}
              onImportVaultPack={store.importVaultPack}
              onDeleteVaultPack={store.deleteVaultPack}
              onAddCustomVaultCard={store.addCustomVaultCard}
              onDeleteVaultCard={store.deleteVaultCard}
              onSyncVaultFromGithub={store.syncVaultFromGithub}
              onDrillMatchingPyqs={handleDrillMatchingPyqs}
              onNotify={handlePdfDownloadSuccess}
            />
          )}

          {activeView === 'mocks' && (
            <MockAnalyticsView
              mocks={store.state.mocks}
              progress={store.state.progress}
              theme={store.state.theme}
              accentTheme={accentTheme}
              onAddMock={store.addMockTest}
              onDeleteMock={store.deleteMockTest}
              onExportMockPdf={handleExportMockReportPdf}
            />
          )}

          {activeView === 'settings' && (
            <SettingsView
              state={store.state}
              user={store.user}
              syncStatus={store.syncStatus}
              authError={store.authError}
              gaterCount={store.gaterCount}
              gaterSyncStatus={store.gaterSyncStatus}
              onSyncGateR={store.syncGateRFromRepo}
              onSignInGoogle={store.signInWithGoogle}
              onSignOut={store.signOut}
              onSetThemeMode={store.setThemeMode}
              onSetAccentTheme={store.setAccentTheme}
              onToggleSimpleMode={handleToggleSimpleMode}
              onUpdateSettings={store.updateSettings}
              onImportBackup={store.importFullBackup}
              onResetAll={store.resetAllData}
              onExportStudyReportPdf={handleExportStudyReportPdf}
              pwaInstalled={pwa.isInstalled}
              pwaCanPrompt={pwa.canPromptNatively}
              isOnline={pwa.isOnline}
              swActive={pwa.swActive}
              onTriggerPwaInstall={() => void pwa.triggerInstall()}
              onOpenPwaGuide={pwa.openGuide}
            />
          )}
        </main>

        {/* Clean Scholarly Footer with persistent Nihal Pawar credit & Mobile Bottom Nav Clearance */}
        {!hideChrome && (
          <footer className="mt-auto border-t border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#130F0D] pb-24 md:pb-0">
            <div
              className={`${containerMaxWidth} mx-auto px-4 sm:px-6 py-5 flex flex-wrap items-center justify-between gap-3 text-xs text-[#61554D] dark:text-[#A99B8E]`}
            >
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[#1C1613] dark:text-[#F5F0E8]">
                  Built by Nihal Pawar
                </span>
                <span aria-hidden="true">·</span>
                <span>GATE CSE 2027 War Room</span>
              </div>
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => navigateTo('settings')}
                  className="hover:text-[#6E261A] dark:hover:text-[#E0A92E] transition-colors"
                >
                  Settings &amp; Sync
                </button>
                <button
                  type="button"
                  onClick={() => setCommandPaletteOpen(true)}
                  className="hover:text-[#6E261A] dark:hover:text-[#E0A92E] transition-colors"
                >
                  Quick Jump (⌘K)
                </button>
                <button
                  type="button"
                  onClick={() => setInfoModalOpen(true)}
                  className="hover:text-[#6E261A] dark:hover:text-[#E0A92E] transition-colors"
                >
                  Shortcuts &amp; Info
                </button>
              </div>
            </div>
          </footer>
        )}

        {/* Sculpted Floating Curved Mobile Bottom Navigation Capsule (< 768px) */}
        <MobileBottomNav
          activeView={activeView}
          hidden={hideMobileBottomNav}
          simpleMode={simpleMode}
          onSelectView={(v) => navigateTo(v)}
        />

        {/* Safe Exit Confirmation Modal when pressing Back during an Active Timed Mock */}
        {confirmExitTimedTestOpen && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="exit-timed-test-title"
            data-testid="exit-timed-test-modal"
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#1C1613]/55 backdrop-blur-xs p-3 sm:p-4"
          >
            <div className="w-full max-w-sm rounded-[26px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-5 shadow-warm-lg space-y-4">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-full bg-[#FDF6E3] dark:bg-[#2C2215] border border-[#EED89A] dark:border-[#5C441B] text-[#8B6209] dark:text-[#E0A92E] flex items-center justify-center shrink-0">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <h3
                    id="exit-timed-test-title"
                    className="font-display text-base font-bold text-[#1C1613] dark:text-[#F5F0E8]"
                  >
                    Leave Active Timed Mock?
                  </h3>
                  <p className="mt-1 text-xs text-[#61554D] dark:text-[#A99B8E] leading-relaxed">
                    Your timed mock is still running. Return to keep solving, or exit to PYQ Test Builder.
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setConfirmExitTimedTestOpen(false)}
                  className="h-10 px-4 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#241D19] text-xs font-semibold text-[#1C1613] dark:text-[#F5F0E8] press-tactile"
                >
                  Keep Solving
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmExitTimedTestOpen(false);
                    setExitPyqSessionTrigger((n) => n + 1);
                  }}
                  className="h-10 px-4 rounded-full bg-[#6E261A] hover:bg-[#571C13] dark:bg-[#9E3E2E] text-white text-xs font-semibold press-tactile"
                >
                  Exit Test
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Global Overlays */}
        <SlideOverDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          activeView={activeView}
          onNavigate={(v) => navigateTo(v)}
          onOpenMistakeBucket={handleOpenMistakesBucket}
          onJumpFocusTimer={handleJumpToFocusTimer}
          onOpenCalculator={() => setCalculatorOpen((o) => !o)}
          onOpenQuickPdf={handleExportStudyReportPdf}
          onOpenPalette={() => setCommandPaletteOpen(true)}
          theme={store.state.theme}
          onSetLightDark={(mode) => store.setThemeMode(mode)}
          accentTheme={accentTheme}
          onSetAccentTheme={store.setAccentTheme}
          simpleMode={simpleMode}
          onToggleSimpleMode={handleToggleSimpleMode}
          user={store.user}
          syncStatus={store.syncStatus}
          onSignIn={store.signInWithGoogle}
          onSignOut={store.signOut}
          gaterCount={store.gaterCount || store.allQuestions.length}
          gaterSyncStatus={store.gaterSyncStatus}
          streakDays={streakDays}
          unresolvedMistakesCount={unresolvedMistakesCount}
          dueRevisionCount={srsDueCount}
          pwaInstalled={pwa.isInstalled}
          pwaCanPrompt={pwa.canPromptNatively}
          onTriggerPwaInstall={() => void pwa.triggerInstall()}
        />

        <StandaloneSketchpadModal
          isOpen={standaloneSketchpadOpen}
          onClose={() => setStandaloneSketchpadOpen(false)}
          roughWork={store.standaloneRoughWork}
          onSaveRoughWork={store.saveStandaloneRoughWork}
          accentTheme={accentTheme}
          isDark={store.state.theme === 'dark'}
        />

        <CalculatorDrawer
          open={calculatorOpen}
          onClose={() => setCalculatorOpen(false)}
        />

        <CommandPalette
          open={commandPaletteOpen}
          onClose={() => setCommandPaletteOpen(false)}
          theme={store.state.theme}
          onNavigate={(v) => navigateTo(v)}
          onJumpToSubject={handleJumpToSubject}
          onLaunchDailyDpp={handleLaunchDailyDpp}
          onLaunchGaSprint={handleLaunchGaSprint}
          onToggleTheme={store.toggleTheme}
          onToggleCalculator={() => setCalculatorOpen((o) => !o)}
          onOpenInfo={() => setInfoModalOpen(true)}
        />

        <InfoModal
          open={infoModalOpen}
          onClose={() => setInfoModalOpen(false)}
        />

        <PdfExportModal
          request={pdfModalRequest}
          state={store.state}
          onClose={() => setPdfModalRequest(null)}
          onTriggerPrint={handleTriggerPrint}
          onDownloadSuccess={handlePdfDownloadSuccess}
        />

        <PwaInstallModal
          open={pwa.guideOpen}
          onClose={pwa.closeGuide}
          platformHint={pwa.platformHint}
          isInIframe={pwa.isInIframe}
          isInstalled={pwa.isInstalled}
        />

        {/* Global Non-Blocking PDF Download Success Toast */}
        {pdfToast && (
          <div
            role="status"
            data-testid="global-pdf-toast"
            className="no-print fixed bottom-[90px] md:bottom-5 left-1/2 -translate-x-1/2 z-50 max-w-md rounded-full bg-[#241914] text-[#FAF5EB] border border-[#C89216]/50 px-5 py-2.5 text-xs font-semibold shadow-warm-lg flex items-center gap-2.5"
          >
            <span className="h-2 w-2 rounded-full bg-[#7BB88F] shrink-0" />
            <span className="truncate">{pdfToast}</span>
          </div>
        )}

        {/* Persistent Cross-Tab Floating Mini-Timer Pill */}
        <FloatingFocusMiniPill
          visible={activeView !== 'focus'}
          onOpenFocus={() => navigateTo('focus')}
        />
      </div>

      {/* Crisp A4 Vector Print Sheet (Hidden on screen, visible solely during @media print) */}
      <VectorPrintSheet job={activePrintJob} state={store.state} />
    </FocusTimerProvider>
  );
}
