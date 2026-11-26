import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  EPSILON,
  GATE_AUTOMATON_PRESETS,
  GATE_PDA_PRESETS,
  GATE_LANGUAGE_LIBRARY,
  simulateAutomatonTrace,
  inspectAutomatonLanguage,
  convertNfaToDfa,
  minimizeDfa,
  buildAutomatonFromRegex,
  detectPdaDeterminism,
  simulatePda,
  parsePushString,
  isAutomatonNfa,
  type AutomatonModel,
} from './tocStudioEngine';

describe('TOC Studio Engine — DFA / ε-NFA Simulation & Presets', () => {
  it('simulates Binary Divisible by 3 DFA accurately', () => {
    const div3 = GATE_AUTOMATON_PRESETS.find((p) => p.id === 'preset-div3')!;
    assert.ok(div3);
    assert.equal(isAutomatonNfa(div3), false);

    for (const acc of ['', '0', '00', '11', '110', '1001', '1100', '1111']) {
      assert.equal(simulateAutomatonTrace(div3, acc).accepted, true, `Expected ${acc || 'ε'} accepted`);
    }
    for (const rej of ['1', '10', '100', '101', '111', '1010']) {
      assert.equal(simulateAutomatonTrace(div3, rej).accepted, false, `Expected ${rej} rejected`);
    }
  });

  it('simulates Contains Substring 101 DFA accurately', () => {
    const sub101 = GATE_AUTOMATON_PRESETS.find((p) => p.id === 'preset-substr-101')!;
    assert.ok(sub101);
    assert.equal(simulateAutomatonTrace(sub101, '101').accepted, true);
    assert.equal(simulateAutomatonTrace(sub101, '00110100').accepted, true);
    assert.equal(simulateAutomatonTrace(sub101, '11001100').accepted, false);
    assert.equal(simulateAutomatonTrace(sub101, '10').accepted, false);
  });

  it('simulates Even a & Odd b product DFA accurately', () => {
    const parity = GATE_AUTOMATON_PRESETS.find((p) => p.id === 'preset-even-a-odd-b')!;
    assert.ok(parity);
    assert.equal(simulateAutomatonTrace(parity, 'b').accepted, true);
    assert.equal(simulateAutomatonTrace(parity, 'aab').accepted, true);
    assert.equal(simulateAutomatonTrace(parity, 'ababa').accepted, false);
    assert.equal(simulateAutomatonTrace(parity, 'ababb').accepted, true);
    assert.equal(simulateAutomatonTrace(parity, '').accepted, false);
  });

  it('simulates NFA ends-with "ab" and ε-NFA (a+b)*abb accurately', () => {
    const endsAb = GATE_AUTOMATON_PRESETS.find((p) => p.id === 'preset-ends-ab-nfa')!;
    const enfaAbb = GATE_AUTOMATON_PRESETS.find((p) => p.id === 'preset-enfa-abb')!;
    assert.equal(isAutomatonNfa(endsAb), true);
    assert.equal(isAutomatonNfa(enfaAbb), true);

    assert.equal(simulateAutomatonTrace(endsAb, 'ab').accepted, true);
    assert.equal(simulateAutomatonTrace(endsAb, 'bbaab').accepted, true);
    assert.equal(simulateAutomatonTrace(endsAb, 'aba').accepted, false);

    assert.equal(simulateAutomatonTrace(enfaAbb, 'abb').accepted, true);
    assert.equal(simulateAutomatonTrace(enfaAbb, 'ababb').accepted, true);
    assert.equal(simulateAutomatonTrace(enfaAbb, 'ab').accepted, false);
    assert.equal(simulateAutomatonTrace(enfaAbb, 'abba').accepted, false);
  });

  it('detects Infinite, Finite, and Empty language cardinality accurately', () => {
    const div3 = GATE_AUTOMATON_PRESETS[0];
    assert.equal(inspectAutomatonLanguage(div3, 4).cardinality, 'Infinite');

    const finiteDfa: AutomatonModel = {
      id: 'finite-test',
      name: 'Only "a"',
      description: 'Accepts only "a"',
      alphabet: ['a', 'b'],
      states: [
        { id: 'q0', label: 'q0', x: 100, y: 100, isStart: true, isAccept: false },
        { id: 'q1', label: 'q1', x: 250, y: 100, isStart: false, isAccept: true },
        { id: 'q2', label: 'q2', x: 400, y: 100, isStart: false, isAccept: false },
      ],
      transitions: [
        { id: 't1', from: 'q0', to: 'q1', symbols: ['a'] },
        { id: 't2', from: 'q0', to: 'q2', symbols: ['b'] },
        { id: 't3', from: 'q1', to: 'q2', symbols: ['a', 'b'] },
        { id: 't4', from: 'q2', to: 'q2', symbols: ['a', 'b'] },
      ],
    };
    assert.equal(inspectAutomatonLanguage(finiteDfa, 3).cardinality, 'Finite');

    const emptyDfa: AutomatonModel = {
      ...finiteDfa,
      states: finiteDfa.states.map((s) => ({ ...s, isAccept: false })),
    };
    assert.equal(inspectAutomatonLanguage(emptyDfa, 3).cardinality, 'Empty');
  });
});

describe('TOC Studio Engine — Subset Construction, Minimization & Regex', () => {
  it('converts ε-NFA (a+b)*abb to equivalent DFA and minimizes to exact 4 states', () => {
    const enfaAbb = GATE_AUTOMATON_PRESETS.find((p) => p.id === 'preset-enfa-abb')!;
    const sub = convertNfaToDfa(enfaAbb);
    assert.equal(isAutomatonNfa(sub.dfa), false);
    assert.ok(sub.table.length >= 4);

    // Exhaustively check equivalence up to length 5 over {a,b}
    const queue = [''];
    const allStrings: string[] = [];
    while (queue.length > 0) {
      const s = queue.shift()!;
      allStrings.push(s);
      if (s.length < 5) {
        queue.push(s + 'a', s + 'b');
      }
    }
    for (const s of allStrings) {
      const expected = s.endsWith('abb');
      assert.equal(simulateAutomatonTrace(sub.dfa, s).accepted, expected, `DFA mismatch on "${s}"`);
    }

    const min = minimizeDfa(enfaAbb);
    assert.equal(min.minimizedStateCount, 4);
    assert.ok(min.steps.length >= 2);
    for (const s of allStrings) {
      assert.equal(simulateAutomatonTrace(min.minimized, s).accepted, s.endsWith('abb'));
    }
  });

  it('removes unreachable states and preserves minimal 3-state Divisible by 3 DFA', () => {
    const div3 = GATE_AUTOMATON_PRESETS.find((p) => p.id === 'preset-div3')!;
    const withDeadAndDup: AutomatonModel = {
      ...div3,
      states: [
        ...div3.states,
        { id: 'q_unreach', label: 'q_unreach', x: 50, y: 50, isStart: false, isAccept: true },
      ],
      transitions: [
        ...div3.transitions,
        { id: 'tu', from: 'q_unreach', to: 'q_unreach', symbols: ['0', '1'] },
      ],
    };
    const min = minimizeDfa(withDeadAndDup);
    assert.deepEqual(min.unreachableRemoved, ['q_unreach']);
    assert.equal(min.minimizedStateCount, 3);
  });

  it('constructs minimal 3-state DFA from regex (a+b)*ab', () => {
    const res = buildAutomatonFromRegex('(a+b)*ab', { minimizeToDfa: true });
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.equal(res.model.states.length, 3);
    assert.equal(simulateAutomatonTrace(res.model, 'ab').accepted, true);
    assert.equal(simulateAutomatonTrace(res.model, 'baab').accepted, true);
    assert.equal(simulateAutomatonTrace(res.model, 'aba').accepted, false);
    assert.equal(simulateAutomatonTrace(res.model, 'a').accepted, false);
  });
});

describe('TOC Studio Engine — PDA Simulation, Determinism & Language Library', () => {
  it('parses push strings cleanly preserving Z0', () => {
    assert.deepEqual(parsePushString('AZ0'), ['A', 'Z0']);
    assert.deepEqual(parsePushString(EPSILON), []);
    assert.deepEqual(parsePushString('eps'), []);
  });

  it('detects DPDA vs NPDA accurately on all 4 presets', () => {
    const anbn = GATE_PDA_PRESETS.find((p) => p.id === 'pda-anbn')!;
    const wcwr = GATE_PDA_PRESETS.find((p) => p.id === 'pda-wcwr')!;
    const wwr = GATE_PDA_PRESETS.find((p) => p.id === 'pda-wwr')!;
    const eq01 = GATE_PDA_PRESETS.find((p) => p.id === 'pda-equal-01')!;

    assert.equal(detectPdaDeterminism(anbn).isDeterministic, true);
    assert.equal(detectPdaDeterminism(wcwr).isDeterministic, true);
    assert.equal(detectPdaDeterminism(wwr).isDeterministic, false);
    assert.ok(detectPdaDeterminism(wwr).conflicts.length > 0);
    assert.equal(detectPdaDeterminism(eq01).isDeterministic, true);
  });

  it('simulates a^n b^n, w c w^R, w w^R (NPDA), and equal 0s & 1s accurately', () => {
    const anbn = GATE_PDA_PRESETS.find((p) => p.id === 'pda-anbn')!;
    assert.equal(simulatePda(anbn, 'aaabbb', 'final_state').accepted, true);
    assert.equal(simulatePda(anbn, 'aaabbb', 'empty_stack').accepted, true);
    assert.equal(simulatePda(anbn, 'aabbb', 'final_state').accepted, false);

    const wcwr = GATE_PDA_PRESETS.find((p) => p.id === 'pda-wcwr')!;
    assert.equal(simulatePda(wcwr, 'abacaba', 'final_state').accepted, true);
    assert.equal(simulatePda(wcwr, 'abacab', 'final_state').accepted, false);

    const wwr = GATE_PDA_PRESETS.find((p) => p.id === 'pda-wwr')!;
    assert.equal(simulatePda(wwr, 'abba', 'final_state').accepted, true);
    assert.equal(simulatePda(wwr, 'aabbaa', 'empty_stack').accepted, true);
    assert.equal(simulatePda(wwr, 'abab', 'final_state').accepted, false);

    const eq01 = GATE_PDA_PRESETS.find((p) => p.id === 'pda-equal-01')!;
    assert.equal(simulatePda(eq01, '011001', 'final_state').accepted, true);
    assert.equal(simulatePda(eq01, '01100', 'final_state').accepted, false);
  });

  it('ships at least 25 curated GATE CSE languages in the classifier library', () => {
    assert.ok(GATE_LANGUAGE_LIBRARY.length >= 25);
    assert.ok(GATE_LANGUAGE_LIBRARY.some((l) => l.chomskyClass === 'Regular'));
    assert.ok(GATE_LANGUAGE_LIBRARY.some((l) => l.chomskyClass === 'DCFL'));
    assert.ok(GATE_LANGUAGE_LIBRARY.some((l) => l.chomskyClass === 'CFL (Non-DCFL)'));
    assert.ok(GATE_LANGUAGE_LIBRARY.some((l) => l.chomskyClass === 'CSL'));
    assert.ok(GATE_LANGUAGE_LIBRARY.some((l) => l.chomskyClass === 'RE (Non-Recursive)'));
    assert.ok(GATE_LANGUAGE_LIBRARY.some((l) => l.chomskyClass === 'Not RE'));
  });
});
