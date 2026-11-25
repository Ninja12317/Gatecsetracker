import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Trash2,
  Table2,
  Check,
  RotateCcw,
  Columns3,
} from 'lucide-react';
import type { DryRunTraceRow, DryRunTraceTable } from '../types';

interface DryRunTraceTablePanelProps {
  questionId: string;
  savedTable?: DryRunTraceTable;
  onSaveTable: (questionId: string, table: DryRunTraceTable) => void;
  onDeleteTable?: (questionId: string) => void;
  compact?: boolean;
}

interface TracePreset {
  id: string;
  label: string;
  columns: string[];
  rows: string[][];
}

const TRACE_PRESETS: TracePreset[] = [
  {
    id: 'loop',
    label: 'Loop Trace',
    columns: ['Step', 'Line', 'Variables (i, j, sum)', 'Condition', 'Stdout'],
    rows: [
      ['1', 'L4', 'i=0, sum=0', 'i < n (T)', '—'],
      ['2', 'L5', 'i=1, sum=10', 'i < n (T)', '—'],
      ['3', 'L5', 'i=2, sum=30', 'i < n (F)', '30'],
    ],
  },
  {
    id: 'pointer',
    label: 'Pointer & Address Trace',
    columns: ['Step', 'Expr', 'Ptr Addr', 'Deref (*p)', 'Array / Mem'],
    rows: [
      ['1', 'p = a', '0x1000', '*p = 10', '[10, 20, 30]'],
      ['2', 'p++', '0x1004', '*p = 20', '[10, 20, 30]'],
      ['3', '*p += 5', '0x1004', '*p = 25', '[10, 25, 30]'],
    ],
  },
  {
    id: 'recursion',
    label: 'Recursion Stack',
    columns: ['Step', 'Call Frame', 'Static / Local', 'Base Case?', 'Return Val'],
    rows: [
      ['1', 'fun(1)', 'static i=1, n=1', 'No (n<5)', 'calls fun(2)'],
      ['2', 'fun(2)', 'static i=2, n=2', 'No (n<5)', 'calls fun(4)'],
      ['3', 'fun(4)', 'static i=3, n=4', 'No (n<5)', 'calls fun(7)'],
      ['4', 'fun(7)', 'static i=4, n=7', 'Yes (n>=5)', '7'],
    ],
  },
];

function createDefaultTable(questionId: string): DryRunTraceTable {
  return {
    questionId,
    presetName: 'Default',
    columns: ['Step', 'Line', 'Variables / Pointers', 'Condition', 'Stdout'],
    rows: [
      { id: 'r_init_1', cells: ['1', '', '', '', ''] },
      { id: 'r_init_2', cells: ['2', '', '', '', ''] },
      { id: 'r_init_3', cells: ['3', '', '', '', ''] },
    ],
    updatedAt: new Date().toISOString(),
  };
}

export const DryRunTraceTablePanel: React.FC<DryRunTraceTablePanelProps> = ({
  questionId,
  savedTable,
  onSaveTable,
  onDeleteTable,
  compact = false,
}) => {
  const [columns, setColumns] = useState<string[]>(
    () => savedTable?.columns ?? createDefaultTable(questionId).columns
  );
  const [rows, setRows] = useState<DryRunTraceRow[]>(
    () => savedTable?.rows ?? createDefaultTable(questionId).rows
  );
  const [presetName, setPresetName] = useState<string>(savedTable?.presetName ?? 'Default');
  const [saveBadge, setSaveBadge] = useState<string>('');

  // Sync local editor when switching questions or when external Copy-to-Table updates savedTable
  useEffect(() => {
    if (savedTable && savedTable.columns.length > 0) {
      setColumns(savedTable.columns);
      setRows(savedTable.rows);
      setPresetName(savedTable.presetName ?? 'Saved');
    } else {
      const def = createDefaultTable(questionId);
      setColumns(def.columns);
      setRows(def.rows);
      setPresetName(def.presetName ?? 'Default');
    }
  }, [questionId, savedTable]);

  const commitTable = useCallback(
    (nextCols: string[], nextRows: DryRunTraceRow[], nextPreset: string) => {
      setColumns(nextCols);
      setRows(nextRows);
      setPresetName(nextPreset);
      onSaveTable(questionId, {
        questionId,
        columns: nextCols,
        rows: nextRows,
        presetName: nextPreset,
        updatedAt: new Date().toISOString(),
      });
      setSaveBadge('Saved');
      window.setTimeout(() => {
        setSaveBadge((curr) => (curr === 'Saved' ? '' : curr));
      }, 1600);
    },
    [questionId, onSaveTable]
  );

  const handleCellChange = (rowIndex: number, colIndex: number, value: string) => {
    const nextRows = rows.map((row, rIdx) => {
      if (rIdx !== rowIndex) return row;
      const nextCells = columns.map((_, cIdx) => (cIdx === colIndex ? value : row.cells[cIdx] ?? ''));
      return { ...row, cells: nextCells };
    });
    commitTable(columns, nextRows, presetName);
  };

  const handleHeaderChange = (colIndex: number, value: string) => {
    const nextCols = columns.map((col, idx) => (idx === colIndex ? value : col));
    commitTable(nextCols, rows, presetName);
  };

  const handleAddRow = () => {
    if (rows.length >= 60) return;
    const nextStep = String(rows.length + 1);
    const newRow: DryRunTraceRow = {
      id: `r_${Date.now()}_${rows.length}`,
      cells: columns.map((_, idx) => (idx === 0 ? nextStep : '')),
    };
    commitTable(columns, [...rows, newRow], presetName);
  };

  const handleDeleteRow = (rowIndex: number) => {
    const nextRows = rows.filter((_, idx) => idx !== rowIndex);
    commitTable(columns, nextRows, presetName);
  };

  const handleAddColumn = () => {
    if (columns.length >= 10) return;
    const nextCols = [...columns, `Var ${columns.length + 1}`];
    const nextRows = rows.map((r) => ({ ...r, cells: [...r.cells, ''] }));
    commitTable(nextCols, nextRows, presetName);
  };

  const handleDeleteColumn = (colIndex: number) => {
    if (columns.length <= 2) return;
    const nextCols = columns.filter((_, idx) => idx !== colIndex);
    const nextRows = rows.map((r) => ({
      ...r,
      cells: r.cells.filter((_, idx) => idx !== colIndex),
    }));
    commitTable(nextCols, nextRows, presetName);
  };

  const applyPreset = (preset: TracePreset) => {
    const presetRows: DryRunTraceRow[] = preset.rows.map((cells, idx) => ({
      id: `p_${preset.id}_${Date.now()}_${idx}`,
      cells: [...cells],
    }));
    commitTable([...preset.columns], presetRows, preset.label);
  };

  const handleReset = () => {
    const def = createDefaultTable(questionId);
    setColumns(def.columns);
    setRows(def.rows);
    setPresetName('Default');
    if (onDeleteTable) {
      onDeleteTable(questionId);
    } else {
      onSaveTable(questionId, def);
    }
  };

  return (
    <div
      data-testid="dry-run-trace-table-panel"
      className="rounded-[22px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-3.5 sm:p-4 space-y-3"
    >
      {/* Top Header & Presets */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Table2 className="h-4 w-4 text-[#6E261A] dark:text-[#E0A92E]" />
          <span className="font-display text-xs font-bold text-[#1C1613] dark:text-[#F5F0E8]">
            Dry-Run Trace Table
          </span>
          {saveBadge && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#EBF5EE] dark:bg-[#152B1D] text-[#2E5E3E] dark:text-[#7BB88F] text-[10px] font-semibold">
              <Check className="h-3 w-3" />
              {saveBadge}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {TRACE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => applyPreset(preset)}
              className={`px-2.5 py-1 rounded-full border text-[10px] font-semibold press-tactile ${
                presetName === preset.label
                  ? 'border-[#C89216] bg-[#FDF6E3] dark:bg-[#2C2215] text-[#8B6209] dark:text-[#E0A92E]'
                  : 'border-[#E8E0D5] dark:border-[#352A24] bg-[#FAF8F4] dark:bg-[#241D19] text-[#61554D] dark:text-[#D8CBB8] hover:border-[#C89216]'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Editable Curved Spreadsheet */}
      <div
        className={`overflow-x-auto rounded-[16px] border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#130F0D] ${
          compact ? 'max-h-[340px]' : 'max-h-[440px]'
        } overflow-y-auto`}
      >
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-[#F4EFE6] dark:bg-[#241D19] border-b border-[#E8E0D5] dark:border-[#352A24]">
            <tr>
              {columns.map((col, colIdx) => (
                <th
                  key={`col-${colIdx}`}
                  className="p-1.5 border-r border-[#E8E0D5] dark:border-[#2E2520] last:border-r-0 min-w-[78px]"
                >
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={col}
                      onChange={(e) => handleHeaderChange(colIdx, e.target.value)}
                      aria-label={`Column ${colIdx + 1} header`}
                      className="w-full bg-transparent font-mono text-[11px] font-bold text-[#6E261A] dark:text-[#E0A92E] focus:outline-none focus:bg-white dark:focus:bg-[#1C1714] rounded px-1 py-0.5"
                    />
                    {columns.length > 2 && colIdx > 0 && (
                      <button
                        type="button"
                        onClick={() => handleDeleteColumn(colIdx)}
                        title="Remove column"
                        aria-label={`Remove column ${col}`}
                        className="text-[#8C7E75] hover:text-[#B83227] shrink-0 p-0.5"
                      >
                        <Trash2 className="h-2.5 w-2.5" />
                      </button>
                    )}
                  </div>
                </th>
              ))}
              <th className="w-8 p-1 text-center text-[10px] font-mono text-[#8C7E75]">×</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIdx) => (
              <tr
                key={row.id}
                className="border-b border-[#E8E0D5]/80 dark:border-[#2A221D] last:border-b-0 odd:bg-[#FFFFFF] even:bg-[#FAF8F4] dark:odd:bg-[#1C1714] dark:even:bg-[#161210]"
              >
                {columns.map((_, colIdx) => (
                  <td
                    key={`${row.id}-${colIdx}`}
                    className="p-1 border-r border-[#E8E0D5]/70 dark:border-[#2A221D] last:border-r-0"
                  >
                    <input
                      type="text"
                      value={row.cells[colIdx] ?? ''}
                      onChange={(e) => handleCellChange(rowIdx, colIdx, e.target.value)}
                      placeholder={colIdx === 0 ? String(rowIdx + 1) : '...'}
                      aria-label={`Row ${rowIdx + 1} ${columns[colIdx]}`}
                      className={`w-full bg-transparent font-mono text-[11px] text-[#1C1613] dark:text-[#F5F0E8] placeholder:text-[#B5A99F] dark:placeholder:text-[#5B4F47] focus:outline-none focus:bg-[#FDF6E3]/70 dark:focus:bg-[#2C2215] rounded px-1.5 py-1 ${
                        colIdx === 0 ? 'w-12 text-center font-bold text-[#61554D] dark:text-[#A99B8E]' : ''
                      }`}
                    />
                  </td>
                ))}
                <td className="p-1 text-center">
                  <button
                    type="button"
                    onClick={() => handleDeleteRow(rowIdx)}
                    aria-label={`Delete row ${rowIdx + 1}`}
                    className="text-[#8C7E75] hover:text-[#B83227] p-1 rounded-full"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length + 1}
                  className="py-5 text-center text-xs text-[#8C7E75]"
                >
                  No trace rows yet — click &ldquo;+ Add Row&rdquo; or pick a preset above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Bottom Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={handleAddRow}
            data-testid="trace-add-row-btn"
            className="inline-flex items-center gap-1 h-8 px-3 rounded-full bg-[#6E261A] hover:bg-[#571C13] dark:bg-[#9E3E2E] text-white text-[11px] font-semibold press-tactile"
          >
            <Plus className="h-3 w-3" />
            Add Row
          </button>
          <button
            type="button"
            onClick={handleAddColumn}
            data-testid="trace-add-col-btn"
            className="inline-flex items-center gap-1 h-8 px-3 rounded-full border border-[#E8E0D5] dark:border-[#352A24] bg-[#FAF8F4] dark:bg-[#241D19] hover:border-[#C89216] text-[11px] font-semibold text-[#1C1613] dark:text-[#F5F0E8] press-tactile"
          >
            <Columns3 className="h-3 w-3 text-[#C89216] dark:text-[#E0A92E]" />
            Add Column
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[#61554D] dark:text-[#A99B8E] hidden sm:inline">
            Auto-included in Question PDF
          </span>
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full border border-[#E8E0D5] dark:border-[#352A24] text-[11px] font-medium text-[#61554D] dark:text-[#A99B8E] hover:text-[#B83227]"
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </button>
        </div>
      </div>
    </div>
  );
};
