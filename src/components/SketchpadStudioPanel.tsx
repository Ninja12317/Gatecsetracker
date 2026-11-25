import React, { useState } from 'react';
import { PenTool, Table2, Cpu } from 'lucide-react';
import type { DryRunTraceTable, Question } from '../types';
import { Sketchpad } from './Sketchpad';
import { DryRunTraceTablePanel } from './DryRunTraceTablePanel';
import { CodeVisualizerPanel } from './CodeVisualizerPanel';

export type SketchpadStudioTab = 'canvas' | 'trace_table' | 'code_visualizer';

interface SketchpadStudioPanelProps {
  questionId: string;
  activeQuestion?: Question | null;
  savedSketchUrl?: string;
  savedTraceTable?: DryRunTraceTable;
  onSaveSketch: (questionId: string, dataUrl: string) => void;
  onDeleteSketch: (questionId: string) => void;
  onSaveTraceTable: (questionId: string, table: DryRunTraceTable) => void;
  onDeleteTraceTable: (questionId: string) => void;
  initialTab?: SketchpadStudioTab;
}

export const SketchpadStudioPanel: React.FC<SketchpadStudioPanelProps> = ({
  questionId,
  activeQuestion,
  savedSketchUrl,
  savedTraceTable,
  onSaveSketch,
  onDeleteSketch,
  onSaveTraceTable,
  onDeleteTraceTable,
  initialTab = 'canvas',
}) => {
  const [activeTab, setActiveTab] = useState<SketchpadStudioTab>(initialTab);

  const handleCopyTraceToTable = (table: DryRunTraceTable) => {
    onSaveTraceTable(questionId, table);
    setActiveTab('trace_table');
  };

  return (
    <div className="space-y-2.5" data-testid="sketchpad-studio-panel">
      {/* 3-Tab Curved Segmented Switcher */}
      <div
        role="tablist"
        aria-label="Rough-work studio modes"
        className="flex items-center p-1 rounded-full border border-[#E8E0D5] dark:border-[#2E2520] bg-[#EFE9DF] dark:bg-[#241D19]"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'canvas'}
          data-testid="sketch-tab-canvas"
          onClick={() => setActiveTab('canvas')}
          className={`flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-semibold transition-colors press-tactile ${
            activeTab === 'canvas'
              ? 'bg-[#FFFFFF] dark:bg-[#1C1714] text-[#6E261A] dark:text-[#E0A92E] shadow-xs'
              : 'text-[#61554D] dark:text-[#A99B8E] hover:text-[#1C1613] dark:hover:text-[#F5F0E8]'
          }`}
        >
          <PenTool className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Canvas</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'trace_table'}
          data-testid="sketch-tab-trace"
          onClick={() => setActiveTab('trace_table')}
          className={`flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-semibold transition-colors press-tactile ${
            activeTab === 'trace_table'
              ? 'bg-[#FFFFFF] dark:bg-[#1C1714] text-[#6E261A] dark:text-[#E0A92E] shadow-xs'
              : 'text-[#61554D] dark:text-[#A99B8E] hover:text-[#1C1613] dark:hover:text-[#F5F0E8]'
          }`}
        >
          <Table2 className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Trace Table</span>
          {savedTraceTable && savedTraceTable.rows.length > 0 && (
            <span className="h-1.5 w-1.5 rounded-full bg-[#C89216] shrink-0" aria-hidden="true" />
          )}
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'code_visualizer'}
          data-testid="sketch-tab-code"
          onClick={() => setActiveTab('code_visualizer')}
          className={`flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-semibold transition-colors press-tactile ${
            activeTab === 'code_visualizer'
              ? 'bg-[#FFFFFF] dark:bg-[#1C1714] text-[#6E261A] dark:text-[#E0A92E] shadow-xs'
              : 'text-[#61554D] dark:text-[#A99B8E] hover:text-[#1C1613] dark:hover:text-[#F5F0E8]'
          }`}
        >
          <Cpu className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Code &amp; Flow</span>
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'canvas' && (
        <Sketchpad
          questionId={questionId}
          savedSketchUrl={savedSketchUrl}
          onSaveSketch={onSaveSketch}
          onDeleteSketch={onDeleteSketch}
        />
      )}

      {activeTab === 'trace_table' && (
        <DryRunTraceTablePanel
          questionId={questionId}
          savedTable={savedTraceTable}
          onSaveTable={onSaveTraceTable}
          onDeleteTable={onDeleteTraceTable}
          compact
        />
      )}

      {activeTab === 'code_visualizer' && (
        <CodeVisualizerPanel
          questionId={questionId}
          activeQuestion={activeQuestion}
          onCopyTraceToTable={handleCopyTraceToTable}
          compact
        />
      )}
    </div>
  );
};
