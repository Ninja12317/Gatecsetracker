import { useState, useEffect, useMemo, useCallback } from 'react';
import type { NavView, PdfExportRequest, SubjectId } from './types';
import { useWarRoomStore } from './hooks/useWarRoomStore';
import {
  computeStudyStreak,
  needsSpacedRevision,
  toLocalIsoDate,
} from './utils/gateMath';
import { isSrsCardDueToday, makeSrsCardId } from './utils/examPolish';
import { GATE_2027_SYLLABUS } from './data/syllabus';
import { TopBar } from './components/TopBar';
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
import { CommandPalette } from './components/CommandPalette';
import { InfoModal } from './components/InfoModal';
import { PdfExportModal } from './components/PdfExportModal';
import { VectorPrintSheet, type ActivePrintJob } from './components/VectorPrintSheet';
import { PwaInstallModal, OfflineStatusBanner } from './components/PwaInstallModal';
import { usePwaInstall } from './hooks/usePwaInstall';
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
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [infoModalOpen, setInfoModalOpen] = useState(false);
  const [pdfModalRequest, setPdfModalRequest] = useState<PdfExportRequest | null>(null);
  const [activePrintJob, setActivePrintJob] = useState<ActivePrintJob | null>(null);
  const [pdfToast, setPdfToast] = useState<string>('');
  const [focusedSubjectId, setFocusedSubjectId] = useState<SubjectId | null>(null);
  const [autoStartDppTrigger, setAutoStartDppTrigger] = useState(0);
  const [autoStartGaSprintTrigger, setAutoStartGaSprintTrigger] = useState(0);
  const [openMistakesTrigger, setOpenMistakesTrigger] = useState(0);
  const [launchSketchpadSprintTrigger, setLaunchSketchpadSprintTrigger] = useState(0);

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

  const handleJumpToSubject = useCallback((subjectId: SubjectId) => {
    setActiveView('syllabus');
    setFocusedSubjectId(subjectId);
  }, []);

  const handleLaunchDailyDpp = useCallback(() => {
    setActiveView('pyq');
    setAutoStartDppTrigger((n) => n + 1);
  }, []);

  const handleLaunchGaSprint = useCallback(() => {
    setActiveView('pyq');
    setAutoStartGaSprintTrigger((n) => n + 1);
  }, []);

  const handleLaunchSketchpadSprint = useCallback(() => {
    setActiveView('pyq');
    setLaunchSketchpadSprintTrigger((n) => n + 1);
  }, []);

  const handleOpenMistakesBucket = useCallback(() => {
    setActiveView('pyq');
    setOpenMistakesTrigger((n) => n + 1);
  }, []);

  const handleJumpToFocusTimer = useCallback(() => {
    setActiveView('focus');
  }, []);

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

  const contentWidth = store.state.settings.contentWidth ?? 'standard';
  const containerMaxWidth = contentWidth === 'wide' ? 'max-w-[1536px]' : 'max-w-[1280px]';
  const hideChrome = zenMode && activeView === 'pyq';

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
            user={store.user}
            syncStatus={store.syncStatus}
            quotaNotice={store.quotaNotice}
            unresolvedMistakesCount={unresolvedMistakesCount}
            revisionDueCount={revisionDueCount}
            onSelectView={setActiveView}
            onSignInGoogle={store.signInWithGoogle}
            onOpenCommandPalette={() => setCommandPaletteOpen(true)}
            onOpenDrawer={() => setDrawerOpen(true)}
          />
        )}

        <main
          className={`flex-1 w-full ${containerMaxWidth} mx-auto px-4 sm:px-6 ${
            hideChrome ? 'py-4' : 'py-6 sm:py-8'
          }`}
        >
          {activeView === 'dashboard' && (
            <DashboardView
              state={store.state}
              allQuestions={store.allQuestions}
              syncStatus={store.syncStatus}
              allTips={store.allTips}
              totalPyqCount={store.allQuestions.length}
              unresolvedMistakesCount={unresolvedMistakesCount}
              autopilotLoading={store.autopilotLoading}
              autopilotStatusMsg={store.autopilotStatusMsg}
              urlIngestLoading={store.urlIngestLoading}
              onRunDailyAutopilot={store.runDailyAutopilot}
              onIngestPublicUrl={store.ingestPublicUrl}
              onNavigate={setActiveView}
              onJumpToSubject={handleJumpToSubject}
              onLaunchDailyDpp={handleLaunchDailyDpp}
              onLaunchGaSprint={handleLaunchGaSprint}
              onLaunchSketchpadSprint={handleLaunchSketchpadSprint}
              onOpenMistakesBucket={handleOpenMistakesBucket}
              onToggleCalculator={() => setCalculatorOpen((o) => !o)}
              onOpenCommandPalette={() => setCommandPaletteOpen(true)}
              onResetAll={store.resetAllData}
            />
          )}

          {activeView === 'focus' && (
            <FocusStudioView
              studyLogs={store.state.studyLogs}
              dailyGoalMinutes={store.state.settings.dailyGoalMinutes}
              theme={store.state.theme}
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
              autoStartDppTrigger={autoStartDppTrigger}
              autoStartGaSprintTrigger={autoStartGaSprintTrigger}
              openMistakesTrigger={openMistakesTrigger}
              launchSketchpadSprintTrigger={launchSketchpadSprintTrigger}
              gaterSyncStatus={store.gaterSyncStatus}
              gaterCount={store.gaterCount}
              gaterSyncedAt={store.gaterSyncedAt}
              gaterError={store.gaterError}
              subjectFetching={store.subjectFetching}
              subjectCooldownUntil={store.subjectCooldownUntil}
              urlIngestLoading={store.urlIngestLoading}
              quotaNotice={store.quotaNotice}
              onResyncGateR={() => store.syncGateRFromRepo(true)}
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
              onGoToPyq={() => setActiveView('pyq')}
            />
          )}

          {activeView === 'tips' && (
            <TipsVaultView
              allTips={store.allTips}
              bookmarkedTips={store.state.bookmarkedTips}
              unresolvedMistakesCount={unresolvedMistakesCount}
              lastTrapsIstDate={store.state.lastTrapsIstDate}
              trapsGenerating={store.trapsGenerating}
              trapsCooldownUntil={store.trapsCooldownUntil}
              trapsNotice={store.trapsNotice}
              onEnsureDailyTraps={store.ensureDailyTrapsLoaded}
              onGenerateFreshTraps={store.generateFreshTraps}
              onToggleBookmark={store.toggleTipBookmark}
              onAddCustomTip={store.addCustomTip}
              onDeleteCustomTip={store.deleteCustomTip}
            />
          )}

          {activeView === 'mocks' && (
            <MockAnalyticsView
              mocks={store.state.mocks}
              progress={store.state.progress}
              theme={store.state.theme}
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

        {/* Clean Scholarly Footer with persistent Nihal Pawar credit */}
        {!hideChrome && (
          <footer className="mt-auto border-t border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#130F0D]">
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
                  onClick={() => setActiveView('settings')}
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

        {/* Global Overlays */}
        <SlideOverDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          activeView={activeView}
          onNavigate={setActiveView}
          onOpenMistakeBucket={handleOpenMistakesBucket}
          onJumpFocusTimer={handleJumpToFocusTimer}
          onOpenCalculator={() => setCalculatorOpen((o) => !o)}
          onOpenQuickPdf={handleExportStudyReportPdf}
          onOpenPalette={() => setCommandPaletteOpen(true)}
          theme={store.state.theme}
          onSetLightDark={(mode) => store.setThemeMode(mode)}
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

        <CalculatorDrawer
          open={calculatorOpen}
          onClose={() => setCalculatorOpen(false)}
        />

        <CommandPalette
          open={commandPaletteOpen}
          onClose={() => setCommandPaletteOpen(false)}
          theme={store.state.theme}
          onNavigate={setActiveView}
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
            className="no-print fixed bottom-5 left-1/2 -translate-x-1/2 z-50 max-w-md rounded-full bg-[#241914] text-[#FAF5EB] border border-[#C89216]/50 px-5 py-2.5 text-xs font-semibold shadow-warm-lg flex items-center gap-2.5"
          >
            <span className="h-2 w-2 rounded-full bg-[#7BB88F] shrink-0" />
            <span className="truncate">{pdfToast}</span>
          </div>
        )}

        {/* Persistent Cross-Tab Floating Mini-Timer Pill */}
        <FloatingFocusMiniPill
          visible={activeView !== 'focus'}
          onOpenFocus={() => setActiveView('focus')}
        />
      </div>

      {/* Crisp A4 Vector Print Sheet (Hidden on screen, visible solely during @media print) */}
      <VectorPrintSheet job={activePrintJob} state={store.state} />
    </FocusTimerProvider>
  );
}
