import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  GATE_CIRCUIT_PRESETS,
  evaluateCircuit,
  computeCircuitTruthTable,
  solveKMap,
  parseMintermSpec,
  buildCircuitFromKMap,
  analyzeBooleanExpression,
  stepFlipFlop,
  GATE_COUNTER_PRESETS,
  analyzeCounter,
  buildCounterFromSequence,
} from './digitalLogicEngine';

describe('Digital Logic Engine — Interactive Circuit Sandbox & GATE Presets', () => {
  it('evaluates 4:1 MUX 3-var preset to exact Σm(1,2,6,7)', () => {
    const preset = GATE_CIRCUIT_PRESETS.find((p) => p.id === 'preset-mux4-fn')!;
    assert.ok(preset);
    const tt = computeCircuitTruthTable(preset.nodes, preset.wires);
    assert.equal(tt.supported, true);
    assert.equal(tt.rows.length, 8);
    assert.deepEqual(tt.summaries[0].minterms, [1, 2, 6, 7]);
  });

  it('evaluates 2:1 MUX as XOR preset to exact Σm(1,2)', () => {
    const preset = GATE_CIRCUIT_PRESETS.find((p) => p.id === 'preset-mux2-xor')!;
    const tt = computeCircuitTruthTable(preset.nodes, preset.wires);
    assert.equal(tt.supported, true);
    assert.deepEqual(tt.summaries[0].minterms, [1, 2]);
  });

  it('evaluates 3:8 Decoder Full Adder preset to exact Sum Σm(1,2,4,7) and Cout Σm(3,5,6,7)', () => {
    const preset = GATE_CIRCUIT_PRESETS.find((p) => p.id === 'preset-dec38-fa')!;
    const tt = computeCircuitTruthTable(preset.nodes, preset.wires);
    assert.equal(tt.supported, true);
    const sumSummary = tt.summaries.find((s) => s.label === 'Sum')!;
    const coutSummary = tt.summaries.find((s) => s.label === 'Cout')!;
    assert.deepEqual(sumSummary.minterms, [1, 2, 4, 7]);
    assert.deepEqual(coutSummary.minterms, [3, 5, 6, 7]);
  });

  it('evaluates Minimum 4-NAND XOR preset to exact Σm(1,2)', () => {
    const preset = GATE_CIRCUIT_PRESETS.find((p) => p.id === 'preset-4nand-xor')!;
    const tt = computeCircuitTruthTable(preset.nodes, preset.wires);
    assert.equal(tt.supported, true);
    assert.deepEqual(tt.summaries[0].minterms, [1, 2]);
  });

  it('evaluates 4-Bit Ripple Carry Adder preset (0101 + 0011 = 1000, C4=0)', () => {
    const preset = GATE_CIRCUIT_PRESETS.find((p) => p.id === 'preset-4bit-rca')!;
    const res = evaluateCircuit(preset.nodes, preset.wires);
    assert.equal(res.pinValues['s0:in0'], 0);
    assert.equal(res.pinValues['s1:in0'], 0);
    assert.equal(res.pinValues['s2:in0'], 0);
    assert.equal(res.pinValues['s3:in0'], 1);
    assert.equal(res.pinValues['c4:in0'], 0);

    // Override to 1111 + 0001 = 0000 with C4 = 1
    const overflow = evaluateCircuit(preset.nodes, preset.wires, {
      a3: 1, a2: 1, a1: 1, a0: 1,
      b3: 0, b2: 0, b1: 0, b0: 1,
    });
    assert.equal(overflow.pinValues['s0:in0'], 0);
    assert.equal(overflow.pinValues['s1:in0'], 0);
    assert.equal(overflow.pinValues['s2:in0'], 0);
    assert.equal(overflow.pinValues['s3:in0'], 0);
    assert.equal(overflow.pinValues['c4:in0'], 1);
  });
});

describe('Digital Logic Engine — K-Map Quine-McCluskey, Wrap-Around & Synthesis', () => {
  it('minimizes 4-corner wrap-around group Σm(0,2,8,10) to B\'D\'', () => {
    const cells = parseMintermSpec('Σm(0,2,8,10)', 4);
    const sol = solveKMap(4, cells);
    assert.equal(sol.minimalSop, "B'D'");
    assert.equal(sol.essentialPrimeImplicants.length, 1);
  });

  it('solves 4-var K-Map with don\'t-cares Σm(0,1,2,5,7,8,9,10,14) + d(4,12) cleanly', () => {
    const cells = parseMintermSpec('Σm(0,1,2,5,7,8,9,10,14) + d(4,12)', 4);
    const sol = solveKMap(4, cells);
    assert.ok(sol.allPrimeImplicants.length >= 3);
    assert.ok(sol.essentialPrimeImplicants.length >= 2);
    assert.ok(sol.minimalSop.length > 0 && sol.minimalSop !== '0');
    assert.ok(sol.minimalPos.length > 0 && sol.minimalPos !== '1');

    // Verify synthesized circuit reproduces every non-don't-care cell accurately!
    const synth = buildCircuitFromKMap(sol);
    const tt = computeCircuitTruthTable(synth.nodes, synth.wires);
    assert.equal(tt.supported, true);
    for (const row of tt.rows) {
      if (cells[row.index] === 'X') continue;
      assert.equal(row.outputs[0], cells[row.index], `Mismatch at minterm m${row.index}`);
    }
  });

  it('analyzes Boolean expressions and universal NAND/NOR gate counts accurately', () => {
    const xor = analyzeBooleanExpression("A'B + AB'");
    assert.equal(xor.ok, true);
    if (xor.ok) {
      assert.equal(xor.minNand2Count, 4);
      assert.equal(xor.minNor2Count, 5);
      assert.deepEqual(xor.minterms, [1, 2]);
    }

    const xnor = analyzeBooleanExpression("A'B' + AB");
    assert.equal(xnor.ok, true);
    if (xnor.ok) {
      assert.equal(xnor.minNand2Count, 5);
      assert.equal(xnor.minNor2Count, 4);
    }

    const expr3 = analyzeBooleanExpression("A'B + AB' + C");
    assert.equal(expr3.ok, true);
    if (expr3.ok) {
      assert.deepEqual(expr3.minterms, [1, 2, 3, 4, 5, 7]);
    }
  });
});

describe('Digital Logic Engine — Flip-Flops & Sequential Counters', () => {
  it('simulates SR, JK, D, and T flip-flops accurately', () => {
    assert.equal(stepFlipFlop('SR', 0, 1, 0).nextQ, 1);
    assert.equal(stepFlipFlop('SR', 1, 0, 1).nextQ, 0);
    assert.equal(stepFlipFlop('SR', 1, 1, 1).invalid, true);

    assert.equal(stepFlipFlop('JK', 0, 1, 1).nextQ, 1);
    assert.equal(stepFlipFlop('JK', 1, 1, 1).nextQ, 0);

    assert.equal(stepFlipFlop('D', 0, 1).nextQ, 1);
    assert.equal(stepFlipFlop('D', 1, 0).nextQ, 0);

    assert.equal(stepFlipFlop('T', 0, 1).nextQ, 1);
    assert.equal(stepFlipFlop('T', 1, 0).nextQ, 1);
  });

  it('analyzes MOD-6 Ripple, 3-bit Johnson (lockout), 4-bit Ring, and custom sequences', () => {
    const mod6 = GATE_COUNTER_PRESETS.find((p) => p.id === 'mod6_ripple')!;
    const a6 = analyzeCounter(mod6);
    assert.equal(a6.modulus, 6);
    assert.equal(a6.isSelfStarting, true);
    assert.equal(a6.outputFreqLabel, 'f_clk / 6');

    const johnson = GATE_COUNTER_PRESETS.find((p) => p.id === 'johnson_3')!;
    const aj = analyzeCounter(johnson);
    assert.equal(aj.modulus, 6);
    assert.equal(aj.isSelfStarting, false);
    assert.deepEqual(aj.lockoutStates, [2, 5]);

    const ring4 = GATE_COUNTER_PRESETS.find((p) => p.id === 'ring_4')!;
    const ar = analyzeCounter(ring4);
    assert.equal(ar.modulus, 4);
    assert.equal(ar.outputFreqLabel, 'f_clk / 4');

    const custom = buildCounterFromSequence(3, '0, 2, 4, 6', true);
    const ac = analyzeCounter(custom);
    assert.equal(ac.modulus, 4);
    assert.equal(ac.isSelfStarting, true);
  });
});
