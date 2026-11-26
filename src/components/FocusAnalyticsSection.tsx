import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Cell,
} from 'recharts';
import { Flame, Clock, Target, SunMedium, BarChart3, CalendarDays } from 'lucide-react';
import type { AccentThemeId, StudyLogEntry } from '../types';
import { SUBJECT_MAP } from '../data/syllabus';
import { computeStudyStreak, toLocalIsoDate } from '../utils/gateMath';
import { getActiveThemePalette } from '../utils/themeEngine';
import {
  build70DayHeatmap,
  buildLast14DaysChartData,
  buildSubjectHoursVsWeightage,
  computeBestStudyStreak,
  computeBiologicalPeakSync,
  formatMinutesCompact,
  getTodayStudyLogs,
  type HeatmapDayCell,
} from '../utils/focusAnalytics';

interface FocusAnalyticsSectionProps {
  studyLogs: StudyLogEntry[];
  dailyGoalMinutes: number;
  theme: 'light' | 'dark';
  accentTheme?: AccentThemeId;
}

export const FocusAnalyticsSection: React.FC<FocusAnalyticsSectionProps> = React.memo(
  ({ studyLogs, dailyGoalMinutes, theme, accentTheme = 'brown' }) => {
    const todayIso = toLocalIsoDate();
    const isDark = theme === 'dark';
    const palette = getActiveThemePalette(accentTheme, isDark);

    const heatmapDays = useMemo(() => build70DayHeatmap(studyLogs), [studyLogs]);
    const todayLogs = useMemo(() => getTodayStudyLogs(studyLogs, todayIso), [studyLogs, todayIso]);
    const currentStreak = useMemo(
      () => computeStudyStreak(studyLogs, todayIso),
      [studyLogs, todayIso]
    );
    const bestStreak = useMemo(() => computeBestStudyStreak(studyLogs), [studyLogs]);
    const peakSync = useMemo(() => computeBiologicalPeakSync(studyLogs), [studyLogs]);
    const subjectRoiRows = useMemo(() => buildSubjectHoursVsWeightage(studyLogs), [studyLogs]);
    const last14Days = useMemo(
      () => buildLast14DaysChartData(studyLogs, dailyGoalMinutes),
      [studyLogs, dailyGoalMinutes]
    );

    const [selectedCell, setSelectedCell] = useState<HeatmapDayCell | null>(null);

    const todayMinutes = useMemo(
      () => todayLogs.reduce((acc, l) => acc + l.minutes, 0),
      [todayLogs]
    );
    const total70DayMinutes = useMemo(
      () => heatmapDays.reduce((acc, d) => acc + d.minutes, 0),
      [heatmapDays]
    );
    const dailyGoalPct = Math.min(
      100,
      Math.round((todayMinutes / Math.max(1, dailyGoalMinutes)) * 100)
    );
    const goalHours = Number((Math.max(30, dailyGoalMinutes) / 60).toFixed(2));

    const activeCell = selectedCell ?? heatmapDays[heatmapDays.length - 1] ?? null;

    // Live 5-Level Theme-Matched Heatmap Ramp
    const heatHex = (mins: number) => {
      if (mins <= 0) return palette.heatmap[0];
      if (mins < 60) return palette.heatmap[1];
      if (mins < 150) return palette.heatmap[2];
      if (mins < 240) return palette.heatmap[3];
      return palette.heatmap[4];
    };

    const gridStroke = palette.chartGrid;
    const axisColor = palette.chartAxis;
    const maroonBar = palette.chartPrimary;
    const goldBar = palette.chartSecondary;
    const mutedBar = palette.chartMuted;

    return (
      <section className="space-y-5" aria-label="Study Consistency Heatmap and Focus Analytics">
        {/* Top KPI Strip (5 Calm Curved Bento Cards) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
          {/* Today's Tally */}
          <div className="rounded-[24px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-4 shadow-warm">
            <div className="flex items-center justify-between text-[11px] font-medium text-[#61554D] dark:text-[#A99B8E]">
              <span>Today&apos;s Tally</span>
              <Target className="h-3.5 w-3.5 text-[#6E261A] dark:text-[#E0A92E]" />
            </div>
            <div className="mt-2 flex items-baseline justify-between gap-2">
              <span
                data-testid="focus-today-minutes"
                className="font-mono text-2xl font-bold tabular-nums text-[#1C1613] dark:text-[#F5F0E8]"
              >
                {formatMinutesCompact(todayMinutes)}
              </span>
              <span className="font-mono text-[11px] tabular-nums text-[#61554D] dark:text-[#A99B8E]">
                / {formatMinutesCompact(dailyGoalMinutes)}
              </span>
            </div>
            <div className="mt-3 h-1.5 w-full rounded-full bg-[#EFE9DF] dark:bg-[#2C241F] overflow-hidden">
              <div
                className="h-full w-full origin-left rounded-full bg-[#6E261A] dark:bg-[#E0A92E] transition-transform duration-300 ease-apple"
                style={{ transform: `scaleX(${Math.max(0.02, dailyGoalPct / 100)})` }}
              />
            </div>
          </div>

          {/* Sessions Today */}
          <div className="rounded-[24px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-4 shadow-warm">
            <div className="flex items-center justify-between text-[11px] font-medium text-[#61554D] dark:text-[#A99B8E]">
              <span>Sessions Today</span>
              <Clock className="h-3.5 w-3.5 text-[#C89216] dark:text-[#E0A92E]" />
            </div>
            <div
              data-testid="focus-today-sessions-count"
              className="mt-2 font-mono text-2xl font-bold tabular-nums text-[#1C1613] dark:text-[#F5F0E8]"
            >
              {todayLogs.length}
            </div>
            <p className="mt-2 text-[11px] text-[#61554D] dark:text-[#A99B8E] truncate">
              {todayLogs.length > 0
                ? `Avg ${Math.round(todayMinutes / todayLogs.length)}m per block`
                : 'Start your first deep block'}
            </p>
          </div>

          {/* 70-Day Logged Hours */}
          <div className="rounded-[24px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-4 shadow-warm">
            <div className="flex items-center justify-between text-[11px] font-medium text-[#61554D] dark:text-[#A99B8E]">
              <span>70-Day Total</span>
              <CalendarDays className="h-3.5 w-3.5 text-[#6E261A] dark:text-[#E0A92E]" />
            </div>
            <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-[#1C1613] dark:text-[#F5F0E8]">
              {(total70DayMinutes / 60).toFixed(1)}h
            </div>
            <p className="mt-2 font-mono text-[11px] tabular-nums text-[#61554D] dark:text-[#A99B8E]">
              {studyLogs.length} total blocks logged
            </p>
          </div>

          {/* Current & Best Streak */}
          <div className="rounded-[24px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-4 shadow-warm">
            <div className="flex items-center justify-between text-[11px] font-medium text-[#61554D] dark:text-[#A99B8E]">
              <span>Study Streak</span>
              <Flame className="h-3.5 w-3.5 text-[#C89216] dark:text-[#E0A92E]" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-mono text-2xl font-bold tabular-nums text-[#1C1613] dark:text-[#F5F0E8]">
                {currentStreak}d
              </span>
              <span className="font-mono text-[11px] text-[#8B6209] dark:text-[#E0A92E]">
                Best {bestStreak}d
              </span>
            </div>
            <p className="mt-2 text-[11px] text-[#61554D] dark:text-[#A99B8E]">
              Consecutive active study days
            </p>
          </div>

          {/* Biological Peak Shift Sync (GATE Shift Alignment) */}
          <div className="rounded-[24px] squircle border border-[#EED89A] dark:border-[#5C441B] bg-[#FDF6E3] dark:bg-[#2B2114] p-4 shadow-warm">
            <div className="flex items-center justify-between text-[11px] font-medium text-[#8B6209] dark:text-[#E0A92E]">
              <span>GATE Shift Sync</span>
              <SunMedium className="h-3.5 w-3.5 text-[#C89216] dark:text-[#E0A92E]" />
            </div>
            <div
              data-testid="biological-peak-sync"
              className="mt-2 font-mono text-2xl font-bold tabular-nums text-[#6E261A] dark:text-[#F5F0E8]"
            >
              {peakSync.peakPct}%
            </div>
            <p className="mt-2 text-[11px] text-[#8B6209] dark:text-[#D9B664] truncate">
              9:30–12:30 &amp; 14:30–17:30 peak
            </p>
          </div>
        </div>

        {/* Full-Width 70-Day Study Consistency Heatmap */}
        <div className="rounded-[28px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-5 sm:p-6 shadow-warm space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-bold text-[#1C1613] dark:text-[#F5F0E8]">
                70-Day Study Consistency Heatmap
              </h2>
              <p className="text-xs text-[#61554D] dark:text-[#A99B8E] mt-0.5">
                Hover or tap any day cell to inspect logged duration, block count, and dominant GATE subject.
              </p>
            </div>

            <div className="flex items-center gap-1.5 text-[11px] text-[#61554D] dark:text-[#A99B8E]">
              <span>0m</span>
              {palette.heatmap.map((hex, i) => (
                <span
                  key={i}
                  data-theme-swatch="true"
                  className={`h-3 w-3 rounded-[4px] ${i === 0 ? 'border border-[#E8E0D5] dark:border-[#3A2E28]' : ''}`}
                  style={{ backgroundColor: hex }}
                />
              ))}
              <span>4h+</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
            <div
              data-testid="focus-study-heatmap"
              className="lg:col-span-8 grid grid-cols-10 sm:grid-cols-14 gap-1.5 p-3.5 rounded-[20px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#130F0D] content-center"
            >
              {heatmapDays.map((cell) => {
                const isSelected = activeCell?.date === cell.date;
                const topName = cell.topSubjectId
                  ? SUBJECT_MAP[cell.topSubjectId]?.code ?? cell.topSubjectId.toUpperCase()
                  : 'None';
                return (
                  <button
                    key={cell.date}
                    type="button"
                    data-theme-swatch="true"
                    onMouseEnter={() => setSelectedCell(cell)}
                    onFocus={() => setSelectedCell(cell)}
                    onClick={() => setSelectedCell(cell)}
                    aria-label={`${cell.date}: ${cell.minutes} minutes, ${cell.sessionCount} sessions, top subject ${topName}`}
                    style={{ backgroundColor: heatHex(cell.minutes) }}
                    className={`aspect-square rounded-[6px] transition-transform duration-150 hover:scale-110 focus:outline-none ${
                      cell.isToday
                        ? 'ring-2 ring-[#6E261A] dark:ring-[#E0A92E] ring-offset-1 ring-offset-[#FAF8F4] dark:ring-offset-[#130F0D]'
                        : isSelected
                        ? 'ring-2 ring-[#C89216] ring-offset-1 ring-offset-[#FAF8F4] dark:ring-offset-[#130F0D]'
                        : ''
                    }`}
                  />
                );
              })}
            </div>

            {/* Interactive Warm-Cocoa Cell Inspector Card */}
            {activeCell && (
              <div
                data-testid="heatmap-inspector"
                className="lg:col-span-4 rounded-[20px] bg-[#241914] dark:bg-[#171311] text-[#FAF8F4] border border-[#3B2B23] dark:border-[#2E2520] p-4 flex flex-col justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[#B8A695]">
                    Selected Day Inspector
                  </div>
                  <div className="font-mono text-sm font-bold text-[#E0A92E] tabular-nums">
                    {activeCell.date}
                    {activeCell.isToday ? ' · Today' : ''}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="rounded-[14px] bg-white/6 border border-white/8 px-3 py-2">
                    <div className="text-[10px] text-[#B8A695]">Time Logged</div>
                    <div className="mt-0.5 font-mono text-base font-bold tabular-nums text-[#FAF8F4]">
                      {activeCell.minutes > 0 ? formatMinutesCompact(activeCell.minutes) : '0m'}
                    </div>
                  </div>
                  <div className="rounded-[14px] bg-white/6 border border-white/8 px-3 py-2">
                    <div className="text-[10px] text-[#B8A695]">Focus Blocks</div>
                    <div className="mt-0.5 font-mono text-base font-bold tabular-nums text-[#FAF8F4]">
                      {activeCell.sessionCount}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/10 text-xs">
                  <span className="text-[#C7B6A5]">Top Subject</span>
                  {activeCell.topSubjectId ? (
                    <span className="px-2.5 py-0.5 rounded-full bg-[#3A2820] text-[#F3DCA0] font-mono font-semibold text-[11px]">
                      {SUBJECT_MAP[activeCell.topSubjectId]?.code} (
                      {formatMinutesCompact(activeCell.topSubjectMinutes)})
                    </span>
                  ) : (
                    <span className="font-mono text-[11px] text-[#9B897A]">No activity</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* High-ROI Recharts Row (Zero-Blue IITM Palette) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Chart 1: Subject-Wise Hours Logged vs GATE Marks Weightage */}
          <div className="lg:col-span-7 rounded-[28px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-5 sm:p-6 shadow-warm space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-display text-sm font-bold text-[#1C1613] dark:text-[#F5F0E8] flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-[#6E261A] dark:text-[#E0A92E]" />
                  Subject Time Share vs. GATE Marks Weightage
                </h3>
                <p className="text-xs text-[#61554D] dark:text-[#A99B8E] mt-0.5">
                  Spot high-weightage subjects that are under-invested relative to exam marks.
                </p>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-[#61554D] dark:text-[#A99B8E]">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    data-theme-swatch="true"
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: maroonBar }}
                  />
                  Your Study %
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span
                    data-theme-swatch="true"
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: goldBar }}
                  />
                  GATE Marks %
                </span>
              </div>
            </div>

            <div className="h-[290px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={subjectRoiRows}
                  margin={{ top: 8, right: 12, left: -16, bottom: 4 }}
                  barGap={3}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                  <XAxis
                    dataKey="code"
                    tick={{ fill: axisColor, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
                    axisLine={{ stroke: gridStroke }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: axisColor, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
                    axisLine={false}
                    tickLine={false}
                    unit="%"
                  />
                  <Tooltip
                    cursor={{ fill: isDark ? 'rgba(224,169,46,0.08)' : 'rgba(110,38,26,0.05)' }}
                    content={({ active, payload }) => {
                      if (!active || !payload || payload.length === 0) return null;
                      const row = payload[0]?.payload as (typeof subjectRoiRows)[number] | undefined;
                      if (!row) return null;
                      return (
                        <div className="rounded-[16px] bg-[#241914] text-[#FAF8F4] border border-[#C89216]/35 px-3.5 py-2.5 shadow-warm-lg text-xs space-y-1">
                          <div className="font-display font-bold text-[#F3DCA0]">
                            {row.code} · {row.shortName}
                          </div>
                          <div className="font-mono tabular-nums text-[#FAF8F4]">
                            Logged: {row.loggedHours.toFixed(1)} hrs ({row.timeSharePct}% share)
                          </div>
                          <div className="font-mono tabular-nums text-[#E0A92E]">
                            GATE Weightage: {row.weightage} marks
                          </div>
                          <div className="text-[11px] text-[#D4C6B8]">
                            {row.roiDelta < -3
                              ? `Under-invested by ${Math.abs(row.roiDelta).toFixed(1)}%`
                              : row.roiDelta > 4
                              ? `Over-indexed by +${row.roiDelta.toFixed(1)}%`
                              : 'Balanced ROI allocation'}
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Bar
                    dataKey="timeSharePct"
                    name="Your Study %"
                    fill={maroonBar}
                    radius={[6, 6, 0, 0]}
                    maxBarSize={18}
                  />
                  <Bar
                    dataKey="weightage"
                    name="GATE Marks %"
                    fill={goldBar}
                    radius={[6, 6, 0, 0]}
                    maxBarSize={18}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 2: Last 14 Days Daily Hours BarChart with Daily Target ReferenceLine */}
          <div className="lg:col-span-5 rounded-[28px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-5 sm:p-6 shadow-warm space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-display text-sm font-bold text-[#1C1613] dark:text-[#F5F0E8]">
                  Last 14 Days · Daily Focus Hours
                </h3>
                <p className="text-xs text-[#61554D] dark:text-[#A99B8E] mt-0.5">
                  Dashed gold line marks your{' '}
                  <span className="font-mono font-semibold text-[#8B6209] dark:text-[#E0A92E]">
                    {goalHours}h
                  </span>{' '}
                  daily target.
                </p>
              </div>
            </div>

            <div className="h-[290px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={last14Days}
                  margin={{ top: 14, right: 10, left: -18, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                  <XAxis
                    dataKey="shortLabel"
                    tick={{ fill: axisColor, fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
                    axisLine={{ stroke: gridStroke }}
                    tickLine={false}
                    interval={1}
                  />
                  <YAxis
                    domain={[0, (dataMax: number) => Math.max(goalHours, Math.ceil(dataMax + 0.5))]}
                    allowDecimals={false}
                    tick={{ fill: axisColor, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
                    axisLine={false}
                    tickLine={false}
                    unit="h"
                  />
                  <Tooltip
                    cursor={{ fill: isDark ? 'rgba(224,169,46,0.08)' : 'rgba(110,38,26,0.05)' }}
                    content={({ active, payload }) => {
                      if (!active || !payload || payload.length === 0) return null;
                      const row = payload[0]?.payload as (typeof last14Days)[number] | undefined;
                      if (!row) return null;
                      return (
                        <div className="rounded-[16px] bg-[#241914] text-[#FAF8F4] border border-[#C89216]/35 px-3.5 py-2 shadow-warm-lg text-xs space-y-0.5">
                          <div className="font-mono font-semibold text-[#E0A92E]">{row.date}</div>
                          <div className="font-mono tabular-nums">
                            {formatMinutesCompact(row.minutes)} ({row.hours.toFixed(2)}h)
                          </div>
                          <div className="text-[11px] text-[#D4C6B8]">
                            {row.metTarget
                              ? 'Daily target achieved'
                              : `Goal: ${row.goalHours}h`}
                          </div>
                        </div>
                      );
                    }}
                  />
                  <ReferenceLine
                    y={goalHours}
                    stroke={goldBar}
                    strokeDasharray="5 4"
                    strokeWidth={1.75}
                    label={{
                      value: `Target ${goalHours}h`,
                      position: 'insideTopRight',
                      fill: goldBar,
                      fontSize: 10,
                      fontFamily: 'JetBrains Mono, monospace',
                    }}
                  />
                  <Bar dataKey="hours" name="Focus Hours" radius={[7, 7, 0, 0]} maxBarSize={24}>
                    {last14Days.map((entry) => (
                      <Cell
                        key={entry.date}
                        fill={
                          entry.metTarget
                            ? maroonBar
                            : entry.minutes > 0
                            ? goldBar
                            : mutedBar
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </section>
    );
  }
);

FocusAnalyticsSection.displayName = 'FocusAnalyticsSection';
