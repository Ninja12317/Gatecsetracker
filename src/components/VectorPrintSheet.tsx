import React from 'react';
import type {
  DryRunTraceTable,
  PdfExportLayout,
  PdfExportRequest,
  Question,
  WarRoomState,
} from '../types';
import { GATE_2027_SYLLABUS, SUBJECT_MAP } from '../data/syllabus';
import { RichQuestionContent } from './RichQuestionContent';
import { MathText } from './MathText';
import {
  computeCountdown,
  computeStudyStreak,
  computeSubjectMastery,
  computeOverallMastery,
  toLocalIsoDate,
} from '../utils/gateMath';
import { formatPaceDuration, isSlowPaceQuestion } from '../utils/examPolish';
import { hasGateOverflowUrl } from '../utils/subjectMigration';

function formatStudyMinutes(totalMins: number): string {
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hrs <= 0) return `${mins}m`;
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

export interface ActivePrintJob {
  request: PdfExportRequest;
  layout: PdfExportLayout;
  includeExplanation: boolean;
  includeSketch: boolean;
  includeSourceLink: boolean;
  generatedAt: string;
}

interface VectorPrintSheetProps {
  job: ActivePrintJob | null;
  state: WarRoomState;
}

function getOfficialAnswerText(q: Question): string {
  if (q.format === 'MCQ') return q.correctOption || 'Pending Answer Key';
  if (q.format === 'MSQ') {
    return q.correctOptions && q.correctOptions.length > 0
      ? q.correctOptions.join(', ')
      : 'Pending Answer Key';
  }
  if (typeof q.natAnswer === 'number') {
    return `${q.natAnswer}${q.natTolerance ? ` (±${q.natTolerance})` : ''}${q.natUnit ? ` ${q.natUnit}` : ''}`;
  }
  return 'Pending Answer Key';
}

export const VectorPrintSheet: React.FC<VectorPrintSheetProps> = ({ job, state }) => {
  if (!job) return null;

  const { request, layout, includeExplanation, includeSketch, includeSourceLink, generatedAt } = job;
  const dateLabel = new Date(generatedAt).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  const renderHeader = (sheetTitle: string, subtitle?: string) => (
    <header
      style={{
        borderBottom: '2px solid #6E261A',
        paddingBottom: '8pt',
        marginBottom: '12pt',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        gap: '12pt',
      }}
    >
      <div>
        <div
          style={{
            fontSize: '8.5pt',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: '#6E261A',
          }}
        >
          GATE CSE 2027 · PYQ Sprint Sheet · Built by Nihal Pawar
        </div>
        <h1 style={{ fontSize: '16pt', fontWeight: 700, color: '#1C1613', margin: '2pt 0 0 0' }}>
          {sheetTitle}
        </h1>
        {subtitle && (
          <p style={{ fontSize: '9pt', color: '#61554D', margin: '2pt 0 0 0' }}>{subtitle}</p>
        )}
      </div>
      <div style={{ textAlign: 'right', fontSize: '8.5pt', color: '#61554D' }}>
        <div style={{ fontWeight: 600, color: '#1C1613' }}>{dateLabel}</div>
        <div>IIT Madras Academic Layout</div>
      </div>
    </header>
  );

  const renderTraceTable = (table?: DryRunTraceTable) => {
    if (!table || table.columns.length === 0 || table.rows.length === 0) return null;
    return (
      <div style={{ marginTop: '8pt', pageBreakInside: 'avoid' }}>
        <div style={{ fontSize: '8.5pt', fontWeight: 700, color: '#6E261A', marginBottom: '4pt' }}>
          Dry-Run Trace Table ({table.rows.length} steps)
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8pt', fontFamily: 'JetBrains Mono, monospace' }}>
          <thead>
            <tr style={{ backgroundColor: '#6E261A', color: '#FAF8F4' }}>
              {table.columns.map((col, i) => (
                <th
                  key={`th-${i}`}
                  style={{
                    border: '1px solid #571C13',
                    padding: '3.5pt 6pt',
                    textAlign: 'left',
                    fontFamily: 'Inter, sans-serif',
                    fontWeight: 700,
                  }}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, rIdx) => (
              <tr key={row.id} style={{ backgroundColor: rIdx % 2 === 1 ? '#FAF8F4' : '#FFFFFF' }}>
                {table.columns.map((_, cIdx) => (
                  <td
                    key={`${row.id}-${cIdx}`}
                    style={{ border: '1px solid #DFD4C5', padding: '3pt 6pt', color: '#1C1613' }}
                  >
                    {row.cells[cIdx] ?? ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  // 1. Single-Question Vector Sheet
  if (request.kind === 'single-question') {
    const q = request.question;
    const subj = SUBJECT_MAP[q.subjectId];
    const singleTraceTable = request.traceTable ?? state.traceTables?.[q.id];
    return (
      <div className="print-only" style={{ fontFamily: 'Inter, sans-serif', color: '#1C1613' }}>
        {renderHeader(
          q.title || `${subj?.shortName ?? q.subjectId.toUpperCase()} · ${q.subtopic}`,
          `${q.sourceTag} · ${q.format} · ${q.marks} Mark${q.marks > 1 ? 's' : ''}`
        )}

        <article className="print-question-card">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '8pt',
              fontSize: '8.5pt',
              color: '#61554D',
            }}
          >
            <span style={{ fontWeight: 700, color: '#6E261A' }}>
              {subj?.name ?? q.subjectId.toUpperCase()} · {q.subtopic}
            </span>
            <span>
              {q.format} · {q.marks}M{q.year ? ` · GATE ${q.year}` : ''}
              {request.timeSpentSeconds ? ` · Time: ${formatPaceDuration(request.timeSpentSeconds)}` : ''}
            </span>
          </div>

          <RichQuestionContent
            html={q.bodyHtml}
            plainText={q.prompt}
            className="text-[10.5pt]"
          />

          {q.codeSnippet && (
            <pre
              style={{
                marginTop: '8pt',
                padding: '8pt 10pt',
                borderRadius: '6px',
                border: '1px solid #D8CBB8',
                backgroundColor: '#FAF8F4',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '8.5pt',
                whiteSpace: 'pre-wrap',
                overflowX: 'hidden',
              }}
            >
              {q.codeSnippet}
            </pre>
          )}

          {q.format !== 'NAT' && q.optionsExtracted && q.options && q.options.length > 0 && (
            <div style={{ marginTop: '10pt', display: 'grid', gap: '5pt' }}>
              {q.options.map((opt) => (
                <div
                  key={opt.id}
                  style={{
                    border: '1px solid #E8E0D5',
                    borderRadius: '8px',
                    padding: '5pt 8pt',
                    display: 'flex',
                    gap: '8pt',
                    alignItems: 'flex-start',
                  }}
                >
                  <span style={{ fontWeight: 700, color: '#6E261A', minWidth: '16pt' }}>
                    ({opt.id})
                  </span>
                  <div style={{ flex: 1 }}>
                    <RichQuestionContent html={opt.text} plainText={opt.text} inline />
                  </div>
                </div>
              ))}
            </div>
          )}

          {request.userAnswerLabel && (
            <div style={{ marginTop: '8pt', fontSize: '9pt', color: '#61554D' }}>
              <strong>Your Attempt:</strong> {request.userAnswerLabel}
              {request.mistakeTag ? ` · Tag: ${request.mistakeTag}` : ''}
            </div>
          )}

          {includeExplanation && (
            <div
              style={{
                marginTop: '10pt',
                paddingTop: '8pt',
                borderTop: '1px dashed #D8CBB8',
                backgroundColor: '#FAF8F4',
                padding: '8pt 10pt',
                borderRadius: '8px',
              }}
            >
              <div style={{ fontWeight: 700, color: '#2E5E3E', fontSize: '9.5pt', marginBottom: '4pt' }}>
                Verified Answer: {getOfficialAnswerText(q)}
              </div>
              {q.explanation && (
                <div style={{ fontSize: '9.5pt', whiteSpace: 'pre-wrap' }}>
                  <MathText text={q.explanation} />
                </div>
              )}
              {q.wrongOptionAnalysis && (
                <div style={{ fontSize: '9pt', color: '#61554D', marginTop: '4pt' }}>
                  <strong>Trap / Distractor Note:</strong>{' '}
                  <MathText text={q.wrongOptionAnalysis} inline />
                </div>
              )}
              {request.mistakeNote && (
                <div style={{ fontSize: '9pt', color: '#6E261A', marginTop: '4pt' }}>
                  <strong>Personal Revision Note:</strong>{' '}
                  <MathText text={request.mistakeNote} inline />
                </div>
              )}
            </div>
          )}

          {includeSketch && request.sketchDataUrl && (
            <div style={{ marginTop: '10pt', pageBreakInside: 'avoid' }}>
              <div style={{ fontSize: '8.5pt', fontWeight: 700, color: '#61554D', marginBottom: '4pt' }}>
                Saved Rough-Work Sketch
              </div>
              <img
                src={request.sketchDataUrl}
                alt="Saved Rough-Work Sketch"
                style={{
                  maxWidth: '100%',
                  maxHeight: '220pt',
                  border: '1px solid #D8CBB8',
                  borderRadius: '8px',
                  background: '#FFFFFF',
                }}
              />
            </div>
          )}

          {includeSketch && renderTraceTable(singleTraceTable)}

          {includeSourceLink && hasGateOverflowUrl(q) && (
            <div style={{ marginTop: '8pt', fontSize: '8.5pt', color: '#61554D' }}>
              GateOverflow Reference:{' '}
              <a href={q.sourceUrl}>{q.sourceUrl}</a>
            </div>
          )}
        </article>
      </div>
    );
  }

  // 2. Full Test / Sprint / Mistake Bucket Vector Sheet
  if (request.kind === 'test-pack') {
    const questions = request.questions;
    const isWorksheet = layout === 'worksheet';
    const totalMarks = questions.reduce((acc, q) => acc + q.marks, 0);

    return (
      <div className="print-only" style={{ fontFamily: 'Inter, sans-serif', color: '#1C1613' }}>
        {renderHeader(
          request.title,
          `${isWorksheet ? 'Practice Worksheet' : 'Full Solution & Review Booklet'} · ${questions.length} Questions · ${totalMarks} Total Marks${request.subtitle ? ` · ${request.subtitle}` : ''}`
        )}

        {questions.map((q, idx) => {
          const subj = SUBJECT_MAP[q.subjectId];
          const userAns = request.userAnswers?.[q.id];
          const secs = request.questionSeconds?.[q.id];
          const slow = typeof secs === 'number' && isSlowPaceQuestion(q.marks, secs);
          const mistake = request.mistakeMap?.[q.id];
          const sketch = request.savedSketches?.[q.id];
          const traceTable = request.savedTraceTables?.[q.id] ?? state.traceTables?.[q.id];

          return (
            <article key={q.id} className="print-question-card">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '6pt',
                  fontSize: '8.5pt',
                  borderBottom: '1px solid #EFE9DF',
                  paddingBottom: '4pt',
                }}
              >
                <span style={{ fontWeight: 700, color: '#6E261A' }}>
                  Q{idx + 1}. {subj?.shortName ?? q.subjectId.toUpperCase()} · {q.subtopic}
                </span>
                <span style={{ color: '#61554D', fontWeight: 600 }}>
                  {q.format} · {q.marks}M{q.year ? ` · GATE ${q.year}` : ''}
                  {typeof secs === 'number' && secs > 0
                    ? ` · ${formatPaceDuration(secs)}${slow ? ' (Slow Pace)' : ''}`
                    : ''}
                </span>
              </div>

              <RichQuestionContent
                html={q.bodyHtml}
                plainText={q.prompt}
                className="text-[10pt]"
              />

              {q.codeSnippet && (
                <pre
                  style={{
                    marginTop: '6pt',
                    padding: '6pt 8pt',
                    borderRadius: '6px',
                    border: '1px solid #D8CBB8',
                    backgroundColor: '#FAF8F4',
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: '8pt',
                    whiteSpace: 'pre-wrap',
                    overflowX: 'hidden',
                  }}
                >
                  {q.codeSnippet}
                </pre>
              )}

              {q.format !== 'NAT' && q.optionsExtracted && q.options && q.options.length > 0 && (
                <div style={{ marginTop: '8pt', display: 'grid', gap: '4pt' }}>
                  {q.options.map((opt) => (
                    <div
                      key={opt.id}
                      style={{
                        border: '1px solid #E8E0D5',
                        borderRadius: '6px',
                        padding: '4pt 7pt',
                        display: 'flex',
                        gap: '6pt',
                        alignItems: 'flex-start',
                      }}
                    >
                      <span style={{ fontWeight: 700, color: '#6E261A' }}>[ ] ({opt.id})</span>
                      <div style={{ flex: 1 }}>
                        <RichQuestionContent html={opt.text} plainText={opt.text} inline />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {isWorksheet ? (
                <div
                  style={{
                    marginTop: '8pt',
                    height: '44pt',
                    border: '1px dashed #D8CBB8',
                    borderRadius: '6px',
                    padding: '4pt 8pt',
                    fontSize: '8pt',
                    color: '#9A8B7E',
                  }}
                >
                  Rough work / answer box:
                </div>
              ) : (
                <div
                  style={{
                    marginTop: '8pt',
                    padding: '7pt 9pt',
                    borderRadius: '8px',
                    backgroundColor: '#FAF8F4',
                    border: '1px solid #E8E0D5',
                    fontSize: '9pt',
                  }}
                >
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12pt', marginBottom: '4pt' }}>
                    <span style={{ fontWeight: 700, color: '#2E5E3E' }}>
                      Official Answer: {getOfficialAnswerText(q)}
                    </span>
                    {userAns && (
                      <span style={{ color: '#61554D' }}>
                        <strong>Attempted:</strong> {userAns}
                      </span>
                    )}
                    {mistake && (
                      <span style={{ color: '#B83227', fontWeight: 600 }}>
                        Mistake Tag: {mistake.errorTag}
                      </span>
                    )}
                  </div>
                  {q.explanation && (
                    <div style={{ whiteSpace: 'pre-wrap', color: '#1C1613' }}>
                      <MathText text={q.explanation} />
                    </div>
                  )}
                  {mistake?.userNote && (
                    <div style={{ marginTop: '4pt', color: '#6E261A' }}>
                      <strong>Note:</strong> <MathText text={mistake.userNote} inline />
                    </div>
                  )}
                  {includeSketch && sketch && (
                    <div style={{ marginTop: '6pt' }}>
                      <img
                        src={sketch}
                        alt={`Sketch for Q${idx + 1}`}
                        style={{ maxHeight: '140pt', border: '1px solid #D8CBB8', borderRadius: '6px' }}
                      />
                    </div>
                  )}
                  {includeSketch && renderTraceTable(traceTable)}
                  {includeSourceLink && hasGateOverflowUrl(q) && (
                    <div style={{ marginTop: '4pt', fontSize: '8pt', color: '#61554D' }}>
                      Source: <a href={q.sourceUrl}>{q.sourceUrl}</a>
                    </div>
                  )}
                </div>
              )}
            </article>
          );
        })}

        {/* Compact Answer Key Table on last page for Practice Worksheet */}
        {isWorksheet && (
          <section className="print-page-break">
            {renderHeader(`${request.title} — Answer Key`, 'Compact Verification Table')}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9pt' }}>
              <thead>
                <tr style={{ backgroundColor: '#F4EFE6' }}>
                  <th style={{ border: '1px solid #D8CBB8', padding: '5pt 8pt', textAlign: 'left' }}>Q#</th>
                  <th style={{ border: '1px solid #D8CBB8', padding: '5pt 8pt', textAlign: 'left' }}>Subject</th>
                  <th style={{ border: '1px solid #D8CBB8', padding: '5pt 8pt', textAlign: 'left' }}>Format / Marks</th>
                  <th style={{ border: '1px solid #D8CBB8', padding: '5pt 8pt', textAlign: 'left' }}>Answer Key</th>
                </tr>
              </thead>
              <tbody>
                {questions.map((q, idx) => (
                  <tr key={`key-${q.id}`}>
                    <td style={{ border: '1px solid #E8E0D5', padding: '4pt 8pt', fontWeight: 700 }}>
                      Q{idx + 1}
                    </td>
                    <td style={{ border: '1px solid #E8E0D5', padding: '4pt 8pt' }}>
                      {SUBJECT_MAP[q.subjectId]?.shortName ?? q.subjectId.toUpperCase()} · {q.subtopic}
                    </td>
                    <td style={{ border: '1px solid #E8E0D5', padding: '4pt 8pt' }}>
                      {q.format} · {q.marks}M
                    </td>
                    <td style={{ border: '1px solid #E8E0D5', padding: '4pt 8pt', fontWeight: 700, color: '#2E5E3E' }}>
                      {getOfficialAnswerText(q)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>
    );
  }

  // 3. Mock Test Analytics & Diagnostics Report PDF
  if (request.kind === 'mock-report') {
    const avgNorm =
      state.mocks.length > 0
        ? Math.round(
            (state.mocks.reduce(
              (acc, m) =>
                acc + (m.normalizedScore ?? (m.maxScore > 0 ? (m.score / m.maxScore) * 100 : 0)),
              0
            ) /
              state.mocks.length) *
              10
          ) / 10
        : 0;
    const meanAcc =
      state.mocks.length > 0
        ? Math.round(state.mocks.reduce((acc, m) => acc + m.accuracy, 0) / state.mocks.length)
        : 0;
    const totalBleed = state.mocks.reduce((acc, m) => acc + (m.penaltyMarks ?? 0), 0);

    return (
      <div className="print-only" style={{ fontFamily: 'Inter, sans-serif', color: '#1C1613' }}>
        {renderHeader(
          request.title || 'GATE CSE 2027 · Mock Test Analytics & Diagnostics',
          `${state.mocks.length} Logged Tests · Avg Normalized ${avgNorm}% · Mean Accuracy ${meanAcc}%`
        )}

        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '8pt',
            marginBottom: '14pt',
          }}
        >
          {[
            { label: 'Tests Logged', value: `${state.mocks.length}` },
            { label: 'Avg Normalized', value: `${avgNorm}%` },
            { label: 'Mean Accuracy', value: `${meanAcc}%` },
            { label: 'Total Penalty Bleed', value: `-${totalBleed.toFixed(2)}M` },
          ].map((kpi) => (
            <div
              key={kpi.label}
              style={{
                border: '1px solid #DFD4C5',
                borderRadius: '10px',
                padding: '8pt 10pt',
                backgroundColor: '#FAF8F4',
              }}
            >
              <div style={{ fontSize: '8pt', textTransform: 'uppercase', color: '#61554D' }}>
                {kpi.label}
              </div>
              <div style={{ fontSize: '14pt', fontWeight: 700, color: '#6E261A', marginTop: '2pt' }}>
                {kpi.value}
              </div>
            </div>
          ))}
        </section>

        <section>
          <h2 style={{ fontSize: '11.5pt', fontWeight: 700, color: '#6E261A', marginBottom: '6pt' }}>
            Logged Mock Tests Archive
          </h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9pt' }}>
            <thead>
              <tr style={{ backgroundColor: '#F4EFE6' }}>
                <th style={{ border: '1px solid #D8CBB8', padding: '5pt 8pt', textAlign: 'left' }}>Date</th>
                <th style={{ border: '1px solid #D8CBB8', padding: '5pt 8pt', textAlign: 'left' }}>Test Name</th>
                <th style={{ border: '1px solid #D8CBB8', padding: '5pt 8pt', textAlign: 'right' }}>Score</th>
                <th style={{ border: '1px solid #D8CBB8', padding: '5pt 8pt', textAlign: 'right' }}>Accuracy</th>
                <th style={{ border: '1px solid #D8CBB8', padding: '5pt 8pt', textAlign: 'right' }}>Bleed</th>
              </tr>
            </thead>
            <tbody>
              {state.mocks.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ border: '1px solid #E8E0D5', padding: '8pt', textAlign: 'center', color: '#61554D' }}>
                    No mocks logged yet.
                  </td>
                </tr>
              ) : (
                [...state.mocks].reverse().map((m) => (
                  <tr key={m.id}>
                    <td style={{ border: '1px solid #E8E0D5', padding: '4pt 8pt' }}>{m.date}</td>
                    <td style={{ border: '1px solid #E8E0D5', padding: '4pt 8pt', fontWeight: 600 }}>{m.name}</td>
                    <td style={{ border: '1px solid #E8E0D5', padding: '4pt 8pt', textAlign: 'right', fontWeight: 700 }}>
                      {m.score.toFixed(2)}/{m.maxScore}
                    </td>
                    <td style={{ border: '1px solid #E8E0D5', padding: '4pt 8pt', textAlign: 'right', color: '#2E5E3E', fontWeight: 700 }}>
                      {m.accuracy}%
                    </td>
                    <td style={{ border: '1px solid #E8E0D5', padding: '4pt 8pt', textAlign: 'right', color: '#B83227' }}>
                      -{(m.penaltyMarks ?? 0).toFixed(2)}M
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      </div>
    );
  }

  // 4. 70-Day Study Report PDF
  const countdown = computeCountdown(state.settings.targetDateIso);
  const streak = computeStudyStreak(state.studyLogs, toLocalIsoDate());
  const weightedMastery = computeOverallMastery(GATE_2027_SYLLABUS, state.progress);
  const totalMinutes = state.studyLogs.reduce((acc, l) => acc + l.minutes, 0);
  const unresolvedMistakes = Object.values(state.mistakes).filter((m) => !m.resolved);
  const subjectRows = GATE_2027_SYLLABUS.map((subj) => {
    const percent = computeSubjectMastery(subj, state.progress);
    const masteredCount = subj.subtopics.filter(
      (st) => state.progress[st.id]?.status === 'mastered'
    ).length;
    return {
      subj,
      percent,
      masteredCount,
      totalCount: subj.subtopics.length,
    };
  }).sort((a, b) => a.percent - b.percent);

  const avgMockNorm =
    state.mocks.length > 0
      ? Math.round(
          (state.mocks.reduce(
            (acc, m) => acc + (m.normalizedScore ?? (m.maxScore > 0 ? (m.score / m.maxScore) * 100 : 0)),
            0
          ) /
            state.mocks.length) *
            10
        ) / 10
      : null;

  return (
    <div className="print-only" style={{ fontFamily: 'Inter, sans-serif', color: '#1C1613' }}>
      {renderHeader(
        request.title || 'GATE CSE 2027 · 70-Day Study & Readiness Report',
        `Target Date: ${state.settings.targetDateIso.slice(0, 10)} (${state.settings.shift}) · ${countdown.days} Days Remaining`
      )}

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '8pt',
          marginBottom: '14pt',
        }}
      >
        {[
          { label: 'Days to GATE', value: `${countdown.days}d` },
          { label: 'Syllabus Mastery', value: `${weightedMastery}%` },
          { label: 'Study Logged', value: formatStudyMinutes(totalMinutes) },
          { label: 'Active Streak', value: `${streak} days` },
        ].map((kpi) => (
          <div
            key={kpi.label}
            style={{
              border: '1px solid #DFD4C5',
              borderRadius: '10px',
              padding: '8pt 10pt',
              backgroundColor: '#FAF8F4',
            }}
          >
            <div style={{ fontSize: '8pt', textTransform: 'uppercase', color: '#61554D' }}>
              {kpi.label}
            </div>
            <div style={{ fontSize: '15pt', fontWeight: 700, color: '#6E261A', marginTop: '2pt' }}>
              {kpi.value}
            </div>
          </div>
        ))}
      </section>

      <section style={{ marginBottom: '14pt' }}>
        <h2 style={{ fontSize: '11.5pt', fontWeight: 700, color: '#6E261A', marginBottom: '6pt' }}>
          Subject Mastery Breakdown (12 GATE CSE Subjects)
        </h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9pt' }}>
          <thead>
            <tr style={{ backgroundColor: '#F4EFE6' }}>
              <th style={{ border: '1px solid #D8CBB8', padding: '5pt 8pt', textAlign: 'left' }}>Subject</th>
              <th style={{ border: '1px solid #D8CBB8', padding: '5pt 8pt', textAlign: 'right' }}>Weight</th>
              <th style={{ border: '1px solid #D8CBB8', padding: '5pt 8pt', textAlign: 'right' }}>Mastered</th>
              <th style={{ border: '1px solid #D8CBB8', padding: '5pt 8pt', textAlign: 'right' }}>Readiness</th>
            </tr>
          </thead>
          <tbody>
            {GATE_2027_SYLLABUS.map((subj) => {
              const percent = computeSubjectMastery(subj, state.progress);
              const masteredCount = subj.subtopics.filter(
                (st) => state.progress[st.id]?.status === 'mastered'
              ).length;
              return (
                <tr key={subj.id}>
                  <td style={{ border: '1px solid #E8E0D5', padding: '4pt 8pt', fontWeight: 600 }}>
                    {subj.name}
                  </td>
                  <td style={{ border: '1px solid #E8E0D5', padding: '4pt 8pt', textAlign: 'right' }}>
                    {subj.weightage}M
                  </td>
                  <td style={{ border: '1px solid #E8E0D5', padding: '4pt 8pt', textAlign: 'right' }}>
                    {masteredCount}/{subj.subtopics.length}
                  </td>
                  <td style={{ border: '1px solid #E8E0D5', padding: '4pt 8pt', textAlign: 'right', fontWeight: 700 }}>
                    {percent}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10pt' }}>
        <div className="print-question-card" style={{ marginBottom: 0 }}>
          <h3 style={{ fontSize: '10.5pt', fontWeight: 700, color: '#6E261A', marginBottom: '6pt' }}>
            Mock Score Summary
          </h3>
          {state.mocks.length === 0 ? (
            <p style={{ fontSize: '9pt', color: '#61554D' }}>No mocks logged yet.</p>
          ) : (
            <div style={{ fontSize: '9pt', display: 'grid', gap: '4pt' }}>
              <div>Total Tests Logged: <strong>{state.mocks.length}</strong></div>
              <div>Avg Normalized Score: <strong>{avgMockNorm}/100</strong></div>
              <div>
                Latest Mock: <strong>{state.mocks[state.mocks.length - 1].name}</strong> (
                {state.mocks[state.mocks.length - 1].score}/{state.mocks[state.mocks.length - 1].maxScore})
              </div>
            </div>
          )}
        </div>

        <div className="print-question-card" style={{ marginBottom: 0 }}>
          <h3 style={{ fontSize: '10.5pt', fontWeight: 700, color: '#6E261A', marginBottom: '6pt' }}>
            Priority Weak Areas &amp; Mistakes
          </h3>
          <div style={{ fontSize: '9pt', display: 'grid', gap: '4pt' }}>
            <div>Unresolved Mistake Bucket Items: <strong>{unresolvedMistakes.length}</strong></div>
            <div>
              Lowest Readiness Subjects:{' '}
              <strong>
                {subjectRows
                  .slice(0, 3)
                  .map((r) => `${r.subj.shortName} (${r.percent}%)`)
                  .join(', ')}
              </strong>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
