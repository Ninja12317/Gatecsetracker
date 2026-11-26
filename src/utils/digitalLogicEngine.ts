/**
 * Pure Client-Side Digital Logic Design Studio Engine for GATE CSE 2027.
 * Zero billing, zero external dependencies:
 * - Interactive Logic Gates + Combinational MSI Blocks (2:1/4:1/8:1 MUX, 1:2/1:4 DEMUX, 2:4/3:8 Decoder, 4:2 Priority Encoder, Half/Full Adder)
 * - Live signal propagation, automatic 2^n Truth Table, Σm / ΠM & Minimized Boolean Expression
 * - Boolean Expression Parser & Minimum NAND-only / NOR-only Universal Gate Counter
 * - Exact Quine-McCluskey + Petrick K-Map Minimizer (2, 3, 4 Variables, SOP & POS, PI & EPI, Wrap-Around Groups) + Circuit Synthesis
 * - Sequential Circuits: SR, JK, D, T Flip-Flop Simulator + Excitation Tables + 2/3/4-bit Counter & Lockout Analyzer
 */

export type LogicBit = 0 | 1;
export type KMapCellVal = 0 | 1 | 'X';

export type CircuitComponentKind =
  | 'INPUT'
  | 'CONST_0'
  | 'CONST_1'
  | 'OUTPUT'
  | 'AND'
  | 'OR'
  | 'NOT'
  | 'NAND'
  | 'NOR'
  | 'XOR'
  | 'XNOR'
  | 'MUX_2_1'
  | 'MUX_4_1'
  | 'MUX_8_1'
  | 'DEMUX_1_2'
  | 'DEMUX_1_4'
  | 'DEC_2_4'
  | 'DEC_3_8'
  | 'PENC_4_2'
  | 'HALF_ADDER'
  | 'FULL_ADDER';

export interface PinDefinition {
  id: string;
  label: string;
  side: 'left' | 'right' | 'bottom';
  xOffset: number;
  yOffset: number;
}

export interface ComponentSpec {
  kind: CircuitComponentKind;
  shortName: string;
  category: 'io' | 'gate' | 'msi';
  width: number;
  height: number;
  inputs: PinDefinition[];
  outputs: PinDefinition[];
}

export interface CircuitNode {
  id: string;
  kind: CircuitComponentKind;
  label: string;
  x: number;
  y: number;
  value?: LogicBit; // used for INPUT nodes
}

export interface CircuitWire {
  id: string;
  fromNodeId: string;
  fromPinId: string;
  toNodeId: string;
  toPinId: string;
}

export interface CircuitPreset {
  id: string;
  name: string;
  subtitle: string;
  nodes: CircuitNode[];
  wires: CircuitWire[];
}

export interface CircuitEvalResult {
  /** key = `${nodeId}:${pinId}` */
  pinValues: Record<string, LogicBit>;
  wireValues: Record<string, LogicBit>;
}

export interface CircuitTruthTableOutputSummary {
  nodeId: string;
  label: string;
  minterms: number[];
  maxterms: number[];
  minimizedSop: string;
  minimizedPos: string;
}

export interface CircuitTruthTable {
  supported: boolean;
  reason?: string;
  inputLabels: string[];
  outputLabels: string[];
  rows: Array<{ index: number; inputs: LogicBit[]; outputs: LogicBit[] }>;
  summaries: CircuitTruthTableOutputSummary[];
}

// ============================================================================
// 1. COMPONENT PIN SPECIFICATIONS
// ============================================================================

function makePinList(
  labels: string[],
  side: 'left' | 'right',
  width: number,
  height: number,
  prefix: string
): PinDefinition[] {
  const n = labels.length;
  return labels.map((label, idx) => ({
    id: `${prefix}${idx}`,
    label,
    side,
    xOffset: side === 'left' ? 0 : width,
    yOffset: Math.round(((idx + 1) / (n + 1)) * height),
  }));
}

export function getComponentSpec(kind: CircuitComponentKind): ComponentSpec {
  switch (kind) {
    case 'INPUT':
      return {
        kind,
        shortName: 'IN',
        category: 'io',
        width: 66,
        height: 36,
        inputs: [],
        outputs: [{ id: 'out0', label: 'Q', side: 'right', xOffset: 66, yOffset: 18 }],
      };
    case 'CONST_0':
      return {
        kind,
        shortName: '0',
        category: 'io',
        width: 44,
        height: 32,
        inputs: [],
        outputs: [{ id: 'out0', label: '0', side: 'right', xOffset: 44, yOffset: 16 }],
      };
    case 'CONST_1':
      return {
        kind,
        shortName: '1',
        category: 'io',
        width: 44,
        height: 32,
        inputs: [],
        outputs: [{ id: 'out0', label: '1', side: 'right', xOffset: 44, yOffset: 16 }],
      };
    case 'OUTPUT':
      return {
        kind,
        shortName: 'LED',
        category: 'io',
        width: 72,
        height: 38,
        inputs: [{ id: 'in0', label: 'Y', side: 'left', xOffset: 0, yOffset: 19 }],
        outputs: [],
      };
    case 'NOT':
      return {
        kind,
        shortName: 'NOT',
        category: 'gate',
        width: 66,
        height: 40,
        inputs: [{ id: 'in0', label: 'A', side: 'left', xOffset: 0, yOffset: 20 }],
        outputs: [{ id: 'out0', label: 'Y', side: 'right', xOffset: 66, yOffset: 20 }],
      };
    case 'AND':
    case 'OR':
    case 'NAND':
    case 'NOR':
    case 'XOR':
    case 'XNOR':
      return {
        kind,
        shortName: kind,
        category: 'gate',
        width: 74,
        height: 48,
        inputs: makePinList(['A', 'B'], 'left', 74, 48, 'in'),
        outputs: [{ id: 'out0', label: 'Y', side: 'right', xOffset: 74, yOffset: 24 }],
      };
    case 'MUX_2_1':
      return {
        kind,
        shortName: '2:1 MUX',
        category: 'msi',
        width: 88,
        height: 76,
        inputs: makePinList(['I0', 'I1', 'S0'], 'left', 88, 76, 'in'),
        outputs: [{ id: 'out0', label: 'Y', side: 'right', xOffset: 88, yOffset: 38 }],
      };
    case 'MUX_4_1':
      return {
        kind,
        shortName: '4:1 MUX',
        category: 'msi',
        width: 96,
        height: 124,
        inputs: makePinList(['I0', 'I1', 'I2', 'I3', 'S1', 'S0'], 'left', 96, 124, 'in'),
        outputs: [{ id: 'out0', label: 'Y', side: 'right', xOffset: 96, yOffset: 62 }],
      };
    case 'MUX_8_1':
      return {
        kind,
        shortName: '8:1 MUX',
        category: 'msi',
        width: 102,
        height: 188,
        inputs: makePinList(
          ['I0', 'I1', 'I2', 'I3', 'I4', 'I5', 'I6', 'I7', 'S2', 'S1', 'S0'],
          'left',
          102,
          188,
          'in'
        ),
        outputs: [{ id: 'out0', label: 'Y', side: 'right', xOffset: 102, yOffset: 94 }],
      };
    case 'DEMUX_1_2':
      return {
        kind,
        shortName: '1:2 DEMUX',
        category: 'msi',
        width: 92,
        height: 70,
        inputs: makePinList(['D', 'S0'], 'left', 92, 70, 'in'),
        outputs: makePinList(['Y0', 'Y1'], 'right', 92, 70, 'out'),
      };
    case 'DEMUX_1_4':
      return {
        kind,
        shortName: '1:4 DEMUX',
        category: 'msi',
        width: 98,
        height: 106,
        inputs: makePinList(['D', 'S1', 'S0'], 'left', 98, 106, 'in'),
        outputs: makePinList(['Y0', 'Y1', 'Y2', 'Y3'], 'right', 98, 106, 'out'),
      };
    case 'DEC_2_4':
      return {
        kind,
        shortName: '2:4 DEC',
        category: 'msi',
        width: 96,
        height: 104,
        inputs: makePinList(['A1', 'A0', 'E'], 'left', 96, 104, 'in'),
        outputs: makePinList(['D0', 'D1', 'D2', 'D3'], 'right', 96, 104, 'out'),
      };
    case 'DEC_3_8':
      return {
        kind,
        shortName: '3:8 DEC',
        category: 'msi',
        width: 102,
        height: 176,
        inputs: makePinList(['A2', 'A1', 'A0', 'E'], 'left', 102, 176, 'in'),
        outputs: makePinList(['D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7'], 'right', 102, 176, 'out'),
      };
    case 'PENC_4_2':
      return {
        kind,
        shortName: '4:2 P-ENC',
        category: 'msi',
        width: 102,
        height: 104,
        inputs: makePinList(['D3', 'D2', 'D1', 'D0'], 'left', 102, 104, 'in'),
        outputs: makePinList(['Y1', 'Y0', 'V'], 'right', 102, 104, 'out'),
      };
    case 'HALF_ADDER':
      return {
        kind,
        shortName: 'HALF ADD',
        category: 'msi',
        width: 94,
        height: 68,
        inputs: makePinList(['A', 'B'], 'left', 94, 68, 'in'),
        outputs: makePinList(['S', 'C'], 'right', 94, 68, 'out'),
      };
    case 'FULL_ADDER':
      return {
        kind,
        shortName: 'FULL ADD',
        category: 'msi',
        width: 96,
        height: 82,
        inputs: makePinList(['A', 'B', 'Cin'], 'left', 96, 82, 'in'),
        outputs: makePinList(['S', 'Cout'], 'right', 96, 82, 'out'),
      };
  }
}

export function evaluateComponent(
  kind: CircuitComponentKind,
  inputs: LogicBit[],
  nodeValue?: LogicBit
): LogicBit[] {
  const b = (idx: number, def: LogicBit = 0): LogicBit => inputs[idx] ?? def;

  switch (kind) {
    case 'INPUT':
      return [nodeValue ?? 0];
    case 'CONST_0':
      return [0];
    case 'CONST_1':
      return [1];
    case 'OUTPUT':
      return [];
    case 'NOT':
      return [b(0) ? 0 : 1];
    case 'AND':
      return [b(0) && b(1) ? 1 : 0];
    case 'OR':
      return [b(0) || b(1) ? 1 : 0];
    case 'NAND':
      return [b(0) && b(1) ? 0 : 1];
    case 'NOR':
      return [b(0) || b(1) ? 0 : 1];
    case 'XOR':
      return [b(0) !== b(1) ? 1 : 0];
    case 'XNOR':
      return [b(0) === b(1) ? 1 : 0];
    case 'MUX_2_1': {
      const sel = b(2);
      return [sel === 0 ? b(0) : b(1)];
    }
    case 'MUX_4_1': {
      const sel = (b(4) << 1) | b(5);
      return [b(sel)];
    }
    case 'MUX_8_1': {
      const sel = (b(8) << 2) | (b(9) << 1) | b(10);
      return [b(sel)];
    }
    case 'DEMUX_1_2': {
      const d = b(0);
      const s0 = b(1);
      return [s0 === 0 ? d : 0, s0 === 1 ? d : 0];
    }
    case 'DEMUX_1_4': {
      const d = b(0);
      const sel = (b(1) << 1) | b(2);
      return [0, 1, 2, 3].map((i) => (i === sel ? d : 0)) as LogicBit[];
    }
    case 'DEC_2_4': {
      const en = inputs[2] ?? 1; // default enabled if unwired
      const sel = (b(0) << 1) | b(1);
      return [0, 1, 2, 3].map((i) => (en && i === sel ? 1 : 0)) as LogicBit[];
    }
    case 'DEC_3_8': {
      const en = inputs[3] ?? 1;
      const sel = (b(0) << 2) | (b(1) << 1) | b(2);
      return [0, 1, 2, 3, 4, 5, 6, 7].map((i) => (en && i === sel ? 1 : 0)) as LogicBit[];
    }
    case 'PENC_4_2': {
      // Inputs: D3 (highest priority), D2, D1, D0
      if (b(0)) return [1, 1, 1];
      if (b(1)) return [1, 0, 1];
      if (b(2)) return [0, 1, 1];
      if (b(3)) return [0, 0, 1];
      return [0, 0, 0];
    }
    case 'HALF_ADDER': {
      const sum = b(0) ^ b(1);
      const carry = b(0) & b(1);
      return [sum as LogicBit, carry as LogicBit];
    }
    case 'FULL_ADDER': {
      const total = b(0) + b(1) + b(2);
      return [(total & 1) as LogicBit, ((total >> 1) & 1) as LogicBit];
    }
  }
}

export function evaluateCircuit(
  nodes: CircuitNode[],
  wires: CircuitWire[],
  inputOverrides?: Record<string, LogicBit>
): CircuitEvalResult {
  const pinValues: Record<string, LogicBit> = {};
  const wireValues: Record<string, LogicBit> = {};

  // Index incoming wires by destination pin
  const incomingByDest = new Map<string, CircuitWire[]>();
  for (const w of wires) {
    const destKey = `${w.toNodeId}:${w.toPinId}`;
    const list = incomingByDest.get(destKey) ?? [];
    list.push(w);
    incomingByDest.set(destKey, list);
  }

  // Iterative relaxation (converges in <= nodes.length passes for any combinational DAG)
  const maxPasses = Math.max(4, Math.min(24, nodes.length + 2));
  for (let pass = 0; pass < maxPasses; pass++) {
    let changed = false;

    for (const node of nodes) {
      const spec = getComponentSpec(node.kind);

      // Gather inputs (if multiple wires feed same input pin, OR them; for Decoder Enable unwired -> default 1)
      const inVals: LogicBit[] = spec.inputs.map((pin, idx) => {
        const destKey = `${node.id}:${pin.id}`;
        const inc = incomingByDest.get(destKey);
        let val: LogicBit = 0;
        if (!inc || inc.length === 0) {
          if ((node.kind === 'DEC_2_4' && idx === 2) || (node.kind === 'DEC_3_8' && idx === 3)) {
            val = 1; // active-high enable defaults to HIGH when unwired
          }
        } else {
          for (const w of inc) {
            const srcKey = `${w.fromNodeId}:${w.fromPinId}`;
            if ((pinValues[srcKey] ?? 0) === 1) {
              val = 1;
              break;
            }
          }
        }
        if (pinValues[destKey] !== val) {
          pinValues[destKey] = val;
          changed = true;
        }
        return val;
      });

      const effectiveVal =
        node.kind === 'INPUT' && inputOverrides && node.id in inputOverrides
          ? inputOverrides[node.id]
          : node.value;

      const outVals = evaluateComponent(node.kind, inVals, effectiveVal);
      spec.outputs.forEach((pin, idx) => {
        const outKey = `${node.id}:${pin.id}`;
        const v = outVals[idx] ?? 0;
        if (pinValues[outKey] !== v) {
          pinValues[outKey] = v;
          changed = true;
        }
      });
    }

    if (!changed) break;
  }

  for (const w of wires) {
    wireValues[w.id] = pinValues[`${w.fromNodeId}:${w.fromPinId}`] ?? 0;
  }

  return { pinValues, wireValues };
}

export function computeCircuitTruthTable(
  nodes: CircuitNode[],
  wires: CircuitWire[]
): CircuitTruthTable {
  const inputNodes = nodes
    .filter((n) => n.kind === 'INPUT')
    .sort((a, b) => a.label.localeCompare(b.label));
  const outputNodes = nodes
    .filter((n) => n.kind === 'OUTPUT')
    .sort((a, b) => a.label.localeCompare(b.label));

  if (inputNodes.length === 0 || outputNodes.length === 0) {
    return {
      supported: false,
      reason: 'Place at least one Input Toggle and one Output LED Probe to inspect the live Truth Table.',
      inputLabels: inputNodes.map((n) => n.label),
      outputLabels: outputNodes.map((n) => n.label),
      rows: [],
      summaries: [],
    };
  }

  if (inputNodes.length > 4) {
    return {
      supported: false,
      reason: `Circuit has ${inputNodes.length} inputs (live 2ⁿ truth table supports up to 4 inputs; use toggles directly to test).`,
      inputLabels: inputNodes.map((n) => n.label),
      outputLabels: outputNodes.map((n) => n.label),
      rows: [],
      summaries: [],
    };
  }

  const n = inputNodes.length;
  const totalRows = 1 << n;
  const rows: Array<{ index: number; inputs: LogicBit[]; outputs: LogicBit[] }> = [];

  for (let mask = 0; mask < totalRows; mask++) {
    const overrides: Record<string, LogicBit> = {};
    const inBits: LogicBit[] = [];
    for (let i = 0; i < n; i++) {
      const bit = ((mask >> (n - 1 - i)) & 1) as LogicBit;
      overrides[inputNodes[i].id] = bit;
      inBits.push(bit);
    }
    const evaluated = evaluateCircuit(nodes, wires, overrides);
    const outBits: LogicBit[] = outputNodes.map((o) => evaluated.pinValues[`${o.id}:in0`] ?? 0);
    rows.push({ index: mask, inputs: inBits, outputs: outBits });
  }

  const varNames = inputNodes.map((inp) => inp.label);
  const summaries: CircuitTruthTableOutputSummary[] = outputNodes.map((out, outIdx) => {
    const minterms: number[] = [];
    const maxterms: number[] = [];
    const cells: Record<number, KMapCellVal> = {};

    rows.forEach((r) => {
      const v = r.outputs[outIdx];
      cells[r.index] = v;
      if (v === 1) minterms.push(r.index);
      else maxterms.push(r.index);
    });

    let minimizedSop = '0';
    let minimizedPos = '1';
    if (n === 1) {
      if (minterms.length === 2) {
        minimizedSop = '1';
        minimizedPos = '1';
      } else if (minterms.length === 0) {
        minimizedSop = '0';
        minimizedPos = '0';
      } else if (minterms[0] === 1) {
        minimizedSop = varNames[0];
        minimizedPos = varNames[0];
      } else {
        minimizedSop = `${varNames[0]}'`;
        minimizedPos = `${varNames[0]}'`;
      }
    } else {
      const solved = solveKMap(n as 2 | 3 | 4, cells, varNames);
      minimizedSop = solved.minimalSop;
      minimizedPos = solved.minimalPos;
    }

    return {
      nodeId: out.id,
      label: out.label,
      minterms,
      maxterms,
      minimizedSop,
      minimizedPos,
    };
  });

  return {
    supported: true,
    inputLabels: varNames,
    outputLabels: outputNodes.map((o) => o.label),
    rows,
    summaries,
  };
}

// ============================================================================
// 2. QUINE-MCCLUSKEY + PETRICK EXACT K-MAP SOLVER (2, 3, 4 VARIABLES)
// ============================================================================

export interface ImplicantTerm {
  id: string;
  bits: string; // e.g. '0-1-'
  minterms: number[]; // covered minterms (excluding don't cares for coverage display)
  allCoveredCells: number[]; // includes covered don't cares
  expression: string; // SOP term e.g. A'C
  isEssential: boolean;
  isSelected: boolean;
  colorIndex: number;
}

export interface KMapSolution {
  numVars: 2 | 3 | 4;
  varNames: string[];
  minterms: number[];
  dontCares: number[];
  maxterms: number[];
  allPrimeImplicants: ImplicantTerm[];
  essentialPrimeImplicants: ImplicantTerm[];
  selectedCover: ImplicantTerm[];
  minimalSop: string;
  minimalPos: string;
}

export function getKMapGridLayout(numVars: 2 | 3 | 4, varNames?: string[]) {
  const vars = varNames ?? (numVars === 2 ? ['A', 'B'] : numVars === 3 ? ['A', 'B', 'C'] : ['A', 'B', 'C', 'D']);
  if (numVars === 2) {
    return {
      rowLabel: vars[0],
      colLabel: vars[1],
      rowHeaders: ['0', '1'],
      colHeaders: ['0', '1'],
      // cell[r][c] = minterm index
      grid: [
        [0, 1],
        [2, 3],
      ],
    };
  }
  if (numVars === 3) {
    return {
      rowLabel: vars[0],
      colLabel: `${vars[1]}${vars[2]}`,
      rowHeaders: ['0', '1'],
      colHeaders: ['00', '01', '11', '10'],
      grid: [
        [0, 1, 3, 2],
        [4, 5, 7, 6],
      ],
    };
  }
  return {
    rowLabel: `${vars[0]}${vars[1]}`,
    colLabel: `${vars[2]}${vars[3]}`,
    rowHeaders: ['00', '01', '11', '10'],
    colHeaders: ['00', '01', '11', '10'],
    grid: [
      [0, 1, 3, 2],
      [4, 5, 7, 6],
      [12, 13, 15, 14],
      [8, 9, 11, 10],
    ],
  };
}

function toBin(n: number, width: number): string {
  return n.toString(2).padStart(width, '0');
}

function combineBitStrings(a: string, b: string): string | null {
  let diffIdx = -1;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      if (diffIdx !== -1) return null;
      diffIdx = i;
    }
  }
  if (diffIdx === -1) return null;
  return a.slice(0, diffIdx) + '-' + a.slice(diffIdx + 1);
}

function expandBitsToCells(bits: string): number[] {
  let acc = [0];
  for (let i = 0; i < bits.length; i++) {
    const ch = bits[i];
    if (ch === '-') {
      acc = acc.flatMap((v) => [(v << 1), (v << 1) | 1]);
    } else {
      const bit = ch === '1' ? 1 : 0;
      acc = acc.map((v) => (v << 1) | bit);
    }
  }
  return acc.sort((a, b) => a - b);
}

function bitsToSopTerm(bits: string, varNames: string[]): string {
  const parts: string[] = [];
  for (let i = 0; i < bits.length; i++) {
    if (bits[i] === '1') parts.push(varNames[i]);
    else if (bits[i] === '0') parts.push(`${varNames[i]}'`);
  }
  return parts.length === 0 ? '1' : parts.join('');
}

function bitsToPosClause(bits: string, varNames: string[]): string {
  // For maxterms: 0 -> literal A, 1 -> literal A'
  const parts: string[] = [];
  for (let i = 0; i < bits.length; i++) {
    if (bits[i] === '0') parts.push(varNames[i]);
    else if (bits[i] === '1') parts.push(`${varNames[i]}'`);
  }
  if (parts.length === 0) return '0';
  return parts.length === 1 ? parts[0] : `(${parts.join(' + ')})`;
}

function runQuineMcCluskeyCore(
  numVars: number,
  targetTerms: number[],
  dontCares: number[],
  varNames: string[],
  mode: 'sop' | 'pos'
): {
  primeImplicants: ImplicantTerm[];
  selected: ImplicantTerm[];
  expression: string;
} {
  const totalCells = 1 << numVars;
  if (targetTerms.length === 0) {
    return {
      primeImplicants: [],
      selected: [],
      expression: mode === 'sop' ? '0' : '1',
    };
  }
  const allTerms = Array.from(new Set([...targetTerms, ...dontCares])).sort((a, b) => a - b);
  if (allTerms.length === totalCells) {
    const allTerm: ImplicantTerm = {
      id: 'pi-0',
      bits: '-'.repeat(numVars),
      minterms: [...targetTerms],
      allCoveredCells: Array.from({ length: totalCells }, (_, i) => i),
      expression: mode === 'sop' ? '1' : '0',
      isEssential: true,
      isSelected: true,
      colorIndex: 0,
    };
    return {
      primeImplicants: [allTerm],
      selected: [allTerm],
      expression: mode === 'sop' ? '1' : '0',
    };
  }

  let current = new Set<string>(allTerms.map((m) => toBin(m, numVars)));
  const primeBits = new Set<string>();

  while (current.size > 0) {
    const arr = Array.from(current);
    const used = new Set<string>();
    const next = new Set<string>();

    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const merged = combineBitStrings(arr[i], arr[j]);
        if (merged) {
          used.add(arr[i]);
          used.add(arr[j]);
          next.add(merged);
        }
      }
    }

    for (const item of arr) {
      if (!used.has(item)) primeBits.add(item);
    }
    current = next;
  }

  const targetSet = new Set(targetTerms);
  // Keep only prime implicants that cover at least one required target term
  const rawPis: ImplicantTerm[] = Array.from(primeBits)
    .map((bits, idx) => {
      const allCoveredCells = expandBitsToCells(bits);
      const minterms = allCoveredCells.filter((c) => targetSet.has(c));
      return {
        id: `pi-${idx}`,
        bits,
        minterms,
        allCoveredCells,
        expression: mode === 'sop' ? bitsToSopTerm(bits, varNames) : bitsToPosClause(bits, varNames),
        isEssential: false,
        isSelected: false,
        colorIndex: idx % 4,
      };
    })
    .filter((pi) => pi.minterms.length > 0)
    .sort((a, b) => b.allCoveredCells.length - a.allCoveredCells.length || a.expression.localeCompare(b.expression));

  // Identify Essential Prime Implicants (EPI)
  const covered = new Set<number>();
  for (const m of targetTerms) {
    const covering = rawPis.filter((pi) => pi.minterms.includes(m));
    if (covering.length === 1) {
      covering[0].isEssential = true;
      covering[0].isSelected = true;
      for (const cm of covering[0].minterms) covered.add(cm);
    }
  }

  // Exact minimal cover for remaining uncovered target terms (branch-and-bound over <= 16 PIs)
  const remainingTerms = targetTerms.filter((m) => !covered.has(m));
  if (remainingTerms.length > 0) {
    const candidates = rawPis.filter((pi) => !pi.isSelected && pi.minterms.some((m) => !covered.has(m)));
    let bestCombo: ImplicantTerm[] | null = null;
    let bestCost = Infinity;

    const literalCount = (bits: string) => bits.split('').filter((c) => c !== '-').length;

    const search = (uncovered: number[], chosen: ImplicantTerm[], startIdx: number) => {
      const cost = chosen.length * 100 + chosen.reduce((acc, c) => acc + literalCount(c.bits), 0);
      if (cost >= bestCost) return;

      if (uncovered.length === 0) {
        bestCost = cost;
        bestCombo = [...chosen];
        return;
      }

      // Pick first uncovered minterm and branch over candidates covering it
      const pivot = uncovered[0];
      for (let i = startIdx; i < candidates.length; i++) {
        const cand = candidates[i];
        if (!cand.minterms.includes(pivot)) continue;
        const nextUncovered = uncovered.filter((m) => !cand.minterms.includes(m));
        chosen.push(cand);
        search(nextUncovered, chosen, 0);
        chosen.pop();
      }
    };

    search(remainingTerms, [], 0);
    if (bestCombo) {
      for (const pi of bestCombo as ImplicantTerm[]) {
        pi.isSelected = true;
      }
    }
  }

  rawPis.forEach((pi, idx) => {
    pi.colorIndex = idx % 4;
  });

  const selected = rawPis.filter((pi) => pi.isSelected);
  const expression =
    mode === 'sop'
      ? selected.map((pi) => pi.expression).join(' + ')
      : selected.map((pi) => pi.expression).join(' · ');

  return {
    primeImplicants: rawPis,
    selected,
    expression: expression || (mode === 'sop' ? '0' : '1'),
  };
}

export function solveKMap(
  numVars: 2 | 3 | 4,
  cells: Record<number, KMapCellVal>,
  customVarNames?: string[]
): KMapSolution {
  const varNames =
    customVarNames ?? (numVars === 2 ? ['A', 'B'] : numVars === 3 ? ['A', 'B', 'C'] : ['A', 'B', 'C', 'D']);
  const total = 1 << numVars;
  const minterms: number[] = [];
  const dontCares: number[] = [];
  const maxterms: number[] = [];

  for (let i = 0; i < total; i++) {
    const v = cells[i] ?? 0;
    if (v === 1) minterms.push(i);
    else if (v === 'X') dontCares.push(i);
    else maxterms.push(i);
  }

  const sop = runQuineMcCluskeyCore(numVars, minterms, dontCares, varNames, 'sop');
  const pos = runQuineMcCluskeyCore(numVars, maxterms, dontCares, varNames, 'pos');

  return {
    numVars,
    varNames,
    minterms,
    dontCares,
    maxterms,
    allPrimeImplicants: sop.primeImplicants,
    essentialPrimeImplicants: sop.primeImplicants.filter((p) => p.isEssential),
    selectedCover: sop.selected,
    minimalSop: sop.expression,
    minimalPos: pos.expression,
  };
}

/**
 * Parses GATE minterm notation like "Σm(0,1,2,5,7,8,9,10,14) + d(4,12)" or "0, 1, 2, 5"
 */
export function parseMintermSpec(
  raw: string,
  numVars: 2 | 3 | 4
): Record<number, KMapCellVal> {
  const maxIdx = (1 << numVars) - 1;
  const cells: Record<number, KMapCellVal> = {};
  for (let i = 0; i <= maxIdx; i++) cells[i] = 0;

  const dcMatch = raw.match(/d\s*\(([^)]*)\)/i);
  const dontCareNums = dcMatch
    ? dcMatch[1]
        .split(/[\s,]+/)
        .map((x) => Number(x.trim()))
        .filter((n) => Number.isInteger(n) && n >= 0 && n <= maxIdx)
    : [];

  const withoutDc = dcMatch ? raw.replace(dcMatch[0], '') : raw;
  const mintermNums = withoutDc
    .replace(/[^0-9,\s]/g, ' ')
    .split(/[\s,]+/)
    .map((x) => Number(x.trim()))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= maxIdx);

  for (const m of mintermNums) cells[m] = 1;
  for (const d of dontCareNums) cells[d] = 'X';
  return cells;
}

/**
 * Synthesizes a real combinational circuit (Inputs + NOTs + ANDs + OR tree + Output LED)
 * directly from a solved K-Map for the "Load into Circuit Workbench" button.
 */
export function buildCircuitFromKMap(solution: KMapSolution): {
  nodes: CircuitNode[];
  wires: CircuitWire[];
} {
  const nodes: CircuitNode[] = [];
  const wires: CircuitWire[] = [];
  let wireIdx = 0;
  const addWire = (fromNodeId: string, fromPinId: string, toNodeId: string, toPinId: string) => {
    wires.push({ id: `kw-${wireIdx++}`, fromNodeId, fromPinId, toNodeId, toPinId });
  };

  // Place input toggles on left
  const inputYGap = 72;
  solution.varNames.forEach((v, idx) => {
    nodes.push({
      id: `in-${v}`,
      kind: 'INPUT',
      label: v,
      x: 24,
      y: 28 + idx * inputYGap,
      value: 0,
    });
  });

  // Handle constant 0 / 1
  if (solution.minimalSop === '0' || solution.minimalSop === '1') {
    const cId = 'const-res';
    nodes.push({
      id: cId,
      kind: solution.minimalSop === '1' ? 'CONST_1' : 'CONST_0',
      label: solution.minimalSop,
      x: 240,
      y: 120,
    });
    nodes.push({ id: 'out-F', kind: 'OUTPUT', label: 'F', x: 430, y: 118 });
    addWire(cId, 'out0', 'out-F', 'in0');
    return { nodes, wires };
  }

  // Create NOT gates only for variables that appear complemented
  const neededNots = new Set<number>();
  for (const term of solution.selectedCover) {
    for (let i = 0; i < term.bits.length; i++) {
      if (term.bits[i] === '0') neededNots.add(i);
    }
  }

  neededNots.forEach((varIdx) => {
    const v = solution.varNames[varIdx];
    const notId = `not-${v}`;
    nodes.push({
      id: notId,
      kind: 'NOT',
      label: `${v}'`,
      x: 130,
      y: 26 + varIdx * inputYGap,
    });
    addWire(`in-${v}`, 'out0', notId, 'in0');
  });

  // Build product terms (2-input AND chains)
  const termOutputs: Array<{ nodeId: string; pinId: string }> = [];
  solution.selectedCover.forEach((term, tIdx) => {
    const lits: Array<{ nodeId: string; pinId: string }> = [];
    for (let i = 0; i < term.bits.length; i++) {
      const v = solution.varNames[i];
      if (term.bits[i] === '1') lits.push({ nodeId: `in-${v}`, pinId: 'out0' });
      else if (term.bits[i] === '0') lits.push({ nodeId: `not-${v}`, pinId: 'out0' });
    }
    if (lits.length === 1) {
      termOutputs.push(lits[0]);
    } else if (lits.length >= 2) {
      let prev = lits[0];
      for (let j = 1; j < lits.length; j++) {
        const andId = `and-${tIdx}-${j}`;
        nodes.push({
          id: andId,
          kind: 'AND',
          label: `P${tIdx + 1}`,
          x: 240 + (j - 1) * 95,
          y: 26 + tIdx * 68,
        });
        addWire(prev.nodeId, prev.pinId, andId, 'in0');
        addWire(lits[j].nodeId, lits[j].pinId, andId, 'in1');
        prev = { nodeId: andId, pinId: 'out0' };
      }
      termOutputs.push(prev);
    }
  });

  // Combine product terms with OR chain
  let finalOut = termOutputs[0];
  for (let i = 1; i < termOutputs.length; i++) {
    const orId = `or-${i}`;
    nodes.push({
      id: orId,
      kind: 'OR',
      label: `OR${i}`,
      x: 455 + (i - 1) * 86,
      y: 78 + (i - 1) * 34,
    });
    addWire(finalOut.nodeId, finalOut.pinId, orId, 'in0');
    addWire(termOutputs[i].nodeId, termOutputs[i].pinId, orId, 'in1');
    finalOut = { nodeId: orId, pinId: 'out0' };
  }

  const outX = Math.max(545, ...nodes.map((n) => n.x + 110));
  nodes.push({ id: 'out-F', kind: 'OUTPUT', label: 'F', x: outX, y: 112 });
  if (finalOut) {
    addWire(finalOut.nodeId, finalOut.pinId, 'out-F', 'in0');
  }

  return { nodes, wires };
}

// ============================================================================
// 3. BOOLEAN EXPRESSION PARSER & UNIVERSAL GATE (NAND / NOR) COUNTER
// ============================================================================

export interface BooleanAnalysisResult {
  ok: true;
  variables: string[];
  minterms: number[];
  maxterms: number[];
  minimalSop: string;
  minimalPos: string;
  minNand2Count: number;
  minNor2Count: number;
  nandFormula: string;
  norFormula: string;
}

export function analyzeBooleanExpression(
  rawExpr: string
): BooleanAnalysisResult | { ok: false; error: string } {
  const cleaned = rawExpr.trim();
  if (!cleaned) {
    return { ok: false, error: "Enter a Boolean expression like A'B + AB' + C or (A+B)(A'+C)." };
  }

  // Extract single uppercase variable letters A..D (or any A-Z up to 4)
  const varMatches = cleaned.match(/[A-Za-z]/g) ?? [];
  const variables = Array.from(new Set(varMatches.map((v) => v.toUpperCase()))).sort();
  if (variables.length === 0) {
    return { ok: false, error: 'Include at least one Boolean variable (e.g., A, B, C).' };
  }
  if (variables.length > 4) {
    return { ok: false, error: 'Boolean analyzer supports up to 4 variables (A, B, C, D).' };
  }

  // Tokenize expression supporting: A, A', !A, ~A, +, |, *, &, ·, ^, (, ), and implicit AND (AB, A'B, )()
  const norm = cleaned
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[·•&*]/g, '&')
    .replace(/[+|]/g, '|')
    .replace(/[~!]/g, '!');

  const rawTokens: string[] = [];
  for (let i = 0; i < norm.length; i++) {
    const ch = norm[i];
    if (/[A-Z01!'&|^()]/.test(ch)) {
      rawTokens.push(ch);
    } else {
      return { ok: false, error: `Unexpected character "${ch}" in Boolean expression.` };
    }
  }

  // Insert implicit '&'
  const tokens: string[] = [];
  const endsAtom = (t: string) => /[A-Z01')]/.test(t);
  const startsAtom = (t: string) => /[A-Z01!(]/.test(t);
  for (let i = 0; i < rawTokens.length; i++) {
    const curr = rawTokens[i];
    tokens.push(curr);
    if (i + 1 < rawTokens.length && endsAtom(curr) && startsAtom(rawTokens[i + 1])) {
      tokens.push('&');
    }
  }

  // Recursive descent evaluator
  const evaluateForEnv = (env: Record<string, LogicBit>): LogicBit => {
    let pos = 0;
    const peek = () => tokens[pos];
    const consume = () => tokens[pos++];

    const parseOr = (): LogicBit => {
      let left = parseXor();
      while (peek() === '|') {
        consume();
        const right = parseXor();
        left = left || right ? 1 : 0;
      }
      return left;
    };

    const parseXor = (): LogicBit => {
      let left = parseAnd();
      while (peek() === '^') {
        consume();
        const right = parseAnd();
        left = left !== right ? 1 : 0;
      }
      return left;
    };

    const parseAnd = (): LogicBit => {
      let left = parseUnary();
      while (peek() === '&') {
        consume();
        const right = parseUnary();
        left = left && right ? 1 : 0;
      }
      return left;
    };

    const parseUnary = (): LogicBit => {
      if (peek() === '!') {
        consume();
        return parseUnary() ? 0 : 1;
      }
      let val = parsePrimary();
      while (peek() === "'") {
        consume();
        val = val ? 0 : 1;
      }
      return val;
    };

    const parsePrimary = (): LogicBit => {
      const tok = peek();
      if (tok === '(') {
        consume();
        const v = parseOr();
        if (consume() !== ')') throw new Error('Missing closing parenthesis ")"');
        return v;
      }
      if (tok === '0') {
        consume();
        return 0;
      }
      if (tok === '1') {
        consume();
        return 1;
      }
      if (tok && /[A-Z]/.test(tok)) {
        consume();
        return env[tok] ?? 0;
      }
      throw new Error(`Unexpected token "${tok ?? 'end of expression'}"`);
    };

    const res = parseOr();
    if (pos !== tokens.length) {
      throw new Error(`Unexpected trailing token "${tokens[pos]}"`);
    }
    return res;
  };

  try {
    const n = variables.length;
    const total = 1 << n;
    const cells: Record<number, KMapCellVal> = {};
    const minterms: number[] = [];
    const maxterms: number[] = [];

    for (let mask = 0; mask < total; mask++) {
      const env: Record<string, LogicBit> = {};
      for (let i = 0; i < n; i++) {
        env[variables[i]] = ((mask >> (n - 1 - i)) & 1) as LogicBit;
      }
      const val = evaluateForEnv(env);
      cells[mask] = val;
      if (val === 1) minterms.push(mask);
      else maxterms.push(mask);
    }

    let minimalSop = '0';
    let minimalPos = '1';
    let sopTermsCount = 0;
    let posClausesCount = 0;
    let sopTermLiterals: number[] = [];
    let posClauseLiterals: number[] = [];
    let complementedVarsSop = new Set<number>();
    let complementedVarsPos = new Set<number>();

    if (n === 1) {
      if (minterms.length === 2) {
        minimalSop = '1';
        minimalPos = '1';
      } else if (minterms.length === 0) {
        minimalSop = '0';
        minimalPos = '0';
      } else if (minterms[0] === 1) {
        minimalSop = variables[0];
        minimalPos = variables[0];
      } else {
        minimalSop = `${variables[0]}'`;
        minimalPos = `${variables[0]}'`;
        complementedVarsSop.add(0);
        complementedVarsPos.add(0);
      }
    } else {
      const sol = solveKMap(n as 2 | 3 | 4, cells, variables);
      minimalSop = sol.minimalSop;
      minimalPos = sol.minimalPos;
      sopTermsCount = sol.selectedCover.length;
      sopTermLiterals = sol.selectedCover.map((t) => t.bits.split('').filter((c) => c !== '-').length);
      sol.selectedCover.forEach((t) => {
        t.bits.split('').forEach((c, i) => {
          if (c === '0') complementedVarsSop.add(i);
        });
      });

      const posCore = runQuineMcCluskeyCore(n, maxterms, [], variables, 'pos');
      posClausesCount = posCore.selected.length;
      posClauseLiterals = posCore.selected.map((t) => t.bits.split('').filter((c) => c !== '-').length);
      posCore.selected.forEach((t) => {
        t.bits.split('').forEach((c, i) => {
          if (c === '1') complementedVarsPos.add(i);
        });
      });
    }

    // Well-known exact GATE 2-input universal gate minimums for canonical 2-var functions + structured SOP/POS NAND-NAND / NOR-NOR count
    let minNand2Count = 0;
    let minNor2Count = 0;
    let nandFormula = '';
    let norFormula = '';

    if (minimalSop === '0' || minimalSop === '1') {
      minNand2Count = 0;
      minNor2Count = 0;
      nandFormula = `Constant ${minimalSop} (0 gates)`;
      norFormula = `Constant ${minimalSop} (0 gates)`;
    } else if (n === 2 && minterms.length === 2 && minterms[0] === 1 && minterms[1] === 2) {
      // Exact GATE classic: XOR = 4 NAND2, 5 NOR2
      minNand2Count = 4;
      minNor2Count = 5;
      nandFormula = '((A ↑ (A ↑ B)) ↑ (B ↑ (A ↑ B))) — 4 two-input NAND gates (GATE Classic!)';
      norFormula = '((A ↓ A) ↓ (B ↓ B)) ↓ (A ↓ B) inverted — 5 two-input NOR gates';
    } else if (n === 2 && minterms.length === 2 && minterms[0] === 0 && minterms[1] === 3) {
      // Exact GATE classic: XNOR = 5 NAND2, 4 NOR2
      minNand2Count = 5;
      minNor2Count = 4;
      nandFormula = 'XOR (4 NAND) + 1 NAND inverter = 5 two-input NAND gates';
      norFormula = '((A ↓ (A ↓ B)) ↓ (B ↓ (A ↓ B))) — 4 two-input NOR gates (GATE Classic!)';
    } else if (n === 1) {
      minNand2Count = complementedVarsSop.size;
      minNor2Count = complementedVarsPos.size;
      nandFormula = complementedVarsSop.size ? `(${variables[0]} ↑ ${variables[0]})` : variables[0];
      norFormula = complementedVarsPos.size ? `(${variables[0]} ↓ ${variables[0]})` : variables[0];
    } else {
      // 2-level NAND-NAND realization from minimal SOP (accounting for 2-input fan-in & inverters)
      const invNand = complementedVarsSop.size;
      const andNand = sopTermLiterals.reduce((acc, k) => acc + Math.max(0, k - 1), 0);
      const orNand = sopTermsCount <= 1 ? 0 : sopTermsCount - 1;
      // Single-literal term into final NAND needs inversion if not already inverted; approximate clean 2-input count:
      const singleLitAdjust =
        sopTermsCount > 1 ? sopTermLiterals.filter((k) => k === 1).length : 0;
      minNand2Count = Math.max(1, invNand + andNand + orNand + singleLitAdjust);
      nandFormula = `NAND-NAND from SOP: ((${minimalSop})')'`;

      const invNor = complementedVarsPos.size;
      const orNor = posClauseLiterals.reduce((acc, k) => acc + Math.max(0, k - 1), 0);
      const andNor = posClausesCount <= 1 ? 0 : posClausesCount - 1;
      const singleClauseAdjust =
        posClausesCount > 1 ? posClauseLiterals.filter((k) => k === 1).length : 0;
      minNor2Count = Math.max(1, invNor + orNor + andNor + singleClauseAdjust);
      norFormula = `NOR-NOR from POS: ((${minimalPos})')'`;
    }

    return {
      ok: true,
      variables,
      minterms,
      maxterms,
      minimalSop,
      minimalPos,
      minNand2Count,
      minNor2Count,
      nandFormula,
      norFormula,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Invalid Boolean expression.',
    };
  }
}

// ============================================================================
// 4. ONE-CLICK GATE EXAM CIRCUIT PRESETS (5 PRESETS)
// ============================================================================

export const GATE_CIRCUIT_PRESETS: CircuitPreset[] = [
  {
    id: 'preset-mux4-fn',
    name: '4:1 MUX Implementing 3-Var Function',
    subtitle: 'Classic GATE PYQ: Select lines S1=A, S0=B, data pins driven by C, C\', 0, 1 → F = Σm(1,2,6,7)',
    nodes: [
      { id: 'inA', kind: 'INPUT', label: 'A', x: 26, y: 36, value: 0 },
      { id: 'inB', kind: 'INPUT', label: 'B', x: 26, y: 102, value: 0 },
      { id: 'inC', kind: 'INPUT', label: 'C', x: 26, y: 170, value: 1 },
      { id: 'notC', kind: 'NOT', label: "C'", x: 140, y: 205 },
      { id: 'c0', kind: 'CONST_0', label: '0', x: 150, y: 132 },
      { id: 'c1', kind: 'CONST_1', label: '1', x: 150, y: 68 },
      { id: 'mux', kind: 'MUX_4_1', label: '4:1 MUX', x: 300, y: 76 },
      { id: 'outF', kind: 'OUTPUT', label: 'F', x: 478, y: 118 },
    ],
    wires: [
      // I0 = C (m1), I1 = C' (m2), I2 = 0 (none), I3 = 1 (m6,m7)
      { id: 'w1', fromNodeId: 'inC', fromPinId: 'out0', toNodeId: 'mux', toPinId: 'in0' },
      { id: 'w2', fromNodeId: 'inC', fromPinId: 'out0', toNodeId: 'notC', toPinId: 'in0' },
      { id: 'w3', fromNodeId: 'notC', fromPinId: 'out0', toNodeId: 'mux', toPinId: 'in1' },
      { id: 'w4', fromNodeId: 'c0', fromPinId: 'out0', toNodeId: 'mux', toPinId: 'in2' },
      { id: 'w5', fromNodeId: 'c1', fromPinId: 'out0', toNodeId: 'mux', toPinId: 'in3' },
      { id: 'w6', fromNodeId: 'inA', fromPinId: 'out0', toNodeId: 'mux', toPinId: 'in4' },
      { id: 'w7', fromNodeId: 'inB', fromPinId: 'out0', toNodeId: 'mux', toPinId: 'in5' },
      { id: 'w8', fromNodeId: 'mux', fromPinId: 'out0', toNodeId: 'outF', toPinId: 'in0' },
    ],
  },
  {
    id: 'preset-mux2-xor',
    name: '2:1 MUX as XOR Gate',
    subtitle: 'S0 = A, I0 = B, I1 = B\' → Y = A ⊕ B using a single 2:1 MUX + NOT',
    nodes: [
      { id: 'inA', kind: 'INPUT', label: 'A', x: 30, y: 158, value: 1 },
      { id: 'inB', kind: 'INPUT', label: 'B', x: 30, y: 66, value: 0 },
      { id: 'notB', kind: 'NOT', label: "B'", x: 155, y: 108 },
      { id: 'mux', kind: 'MUX_2_1', label: '2:1 MUX', x: 295, y: 88 },
      { id: 'outY', kind: 'OUTPUT', label: 'Y', x: 465, y: 106 },
    ],
    wires: [
      { id: 'w1', fromNodeId: 'inB', fromPinId: 'out0', toNodeId: 'mux', toPinId: 'in0' },
      { id: 'w2', fromNodeId: 'inB', fromPinId: 'out0', toNodeId: 'notB', toPinId: 'in0' },
      { id: 'w3', fromNodeId: 'notB', fromPinId: 'out0', toNodeId: 'mux', toPinId: 'in1' },
      { id: 'w4', fromNodeId: 'inA', fromPinId: 'out0', toNodeId: 'mux', toPinId: 'in2' },
      { id: 'w5', fromNodeId: 'mux', fromPinId: 'out0', toNodeId: 'outY', toPinId: 'in0' },
    ],
  },
  {
    id: 'preset-dec38-fa',
    name: '3:8 Decoder + OR Gates as Full Adder',
    subtitle: 'Sum = Σm(1,2,4,7) & Carry = Σm(3,5,6,7) realized directly from a 3:8 Decoder',
    nodes: [
      { id: 'inA', kind: 'INPUT', label: 'A', x: 18, y: 42, value: 1 },
      { id: 'inB', kind: 'INPUT', label: 'B', x: 18, y: 106, value: 0 },
      { id: 'inC', kind: 'INPUT', label: 'Cin', x: 18, y: 170, value: 1 },
      { id: 'dec', kind: 'DEC_3_8', label: '3:8 DEC', x: 130, y: 42 },
      { id: 'orS1', kind: 'OR', label: 'OR', x: 295, y: 30 },
      { id: 'orS2', kind: 'OR', label: 'OR', x: 295, y: 94 },
      { id: 'orS3', kind: 'OR', label: 'Sum', x: 405, y: 60 },
      { id: 'orC1', kind: 'OR', label: 'OR', x: 295, y: 162 },
      { id: 'orC2', kind: 'OR', label: 'OR', x: 295, y: 224 },
      { id: 'orC3', kind: 'OR', label: 'Cout', x: 405, y: 192 },
      { id: 'outS', kind: 'OUTPUT', label: 'Sum', x: 520, y: 64 },
      { id: 'outC', kind: 'OUTPUT', label: 'Cout', x: 520, y: 196 },
    ],
    wires: [
      { id: 'w1', fromNodeId: 'inA', fromPinId: 'out0', toNodeId: 'dec', toPinId: 'in0' },
      { id: 'w2', fromNodeId: 'inB', fromPinId: 'out0', toNodeId: 'dec', toPinId: 'in1' },
      { id: 'w3', fromNodeId: 'inC', fromPinId: 'out0', toNodeId: 'dec', toPinId: 'in2' },
      // Sum = D1 + D2 + D4 + D7
      { id: 'w4', fromNodeId: 'dec', fromPinId: 'out1', toNodeId: 'orS1', toPinId: 'in0' },
      { id: 'w5', fromNodeId: 'dec', fromPinId: 'out2', toNodeId: 'orS1', toPinId: 'in1' },
      { id: 'w6', fromNodeId: 'dec', fromPinId: 'out4', toNodeId: 'orS2', toPinId: 'in0' },
      { id: 'w7', fromNodeId: 'dec', fromPinId: 'out7', toNodeId: 'orS2', toPinId: 'in1' },
      { id: 'w8', fromNodeId: 'orS1', fromPinId: 'out0', toNodeId: 'orS3', toPinId: 'in0' },
      { id: 'w9', fromNodeId: 'orS2', fromPinId: 'out0', toNodeId: 'orS3', toPinId: 'in1' },
      { id: 'w10', fromNodeId: 'orS3', fromPinId: 'out0', toNodeId: 'outS', toPinId: 'in0' },
      // Cout = D3 + D5 + D6 + D7
      { id: 'w11', fromNodeId: 'dec', fromPinId: 'out3', toNodeId: 'orC1', toPinId: 'in0' },
      { id: 'w12', fromNodeId: 'dec', fromPinId: 'out5', toNodeId: 'orC1', toPinId: 'in1' },
      { id: 'w13', fromNodeId: 'dec', fromPinId: 'out6', toNodeId: 'orC2', toPinId: 'in0' },
      { id: 'w14', fromNodeId: 'dec', fromPinId: 'out7', toNodeId: 'orC2', toPinId: 'in1' },
      { id: 'w15', fromNodeId: 'orC1', fromPinId: 'out0', toNodeId: 'orC3', toPinId: 'in0' },
      { id: 'w16', fromNodeId: 'orC2', fromPinId: 'out0', toNodeId: 'orC3', toPinId: 'in1' },
      { id: 'w17', fromNodeId: 'orC3', fromPinId: 'out0', toNodeId: 'outC', toPinId: 'in0' },
    ],
  },
  {
    id: 'preset-4nand-xor',
    name: 'XOR Using Minimum 4 NAND Gates',
    subtitle: 'Optimal 4-NAND universal realization: Y = (A ↑ (A↑B)) ↑ (B ↑ (A↑B))',
    nodes: [
      { id: 'inA', kind: 'INPUT', label: 'A', x: 24, y: 66, value: 1 },
      { id: 'inB', kind: 'INPUT', label: 'B', x: 24, y: 186, value: 0 },
      { id: 'n1', kind: 'NAND', label: 'N1', x: 140, y: 122 },
      { id: 'n2', kind: 'NAND', label: 'N2', x: 266, y: 62 },
      { id: 'n3', kind: 'NAND', label: 'N3', x: 266, y: 182 },
      { id: 'n4', kind: 'NAND', label: 'N4', x: 396, y: 122 },
      { id: 'outY', kind: 'OUTPUT', label: 'XOR', x: 518, y: 126 },
    ],
    wires: [
      { id: 'w1', fromNodeId: 'inA', fromPinId: 'out0', toNodeId: 'n1', toPinId: 'in0' },
      { id: 'w2', fromNodeId: 'inB', fromPinId: 'out0', toNodeId: 'n1', toPinId: 'in1' },
      { id: 'w3', fromNodeId: 'inA', fromPinId: 'out0', toNodeId: 'n2', toPinId: 'in0' },
      { id: 'w4', fromNodeId: 'n1', fromPinId: 'out0', toNodeId: 'n2', toPinId: 'in1' },
      { id: 'w5', fromNodeId: 'n1', fromPinId: 'out0', toNodeId: 'n3', toPinId: 'in0' },
      { id: 'w6', fromNodeId: 'inB', fromPinId: 'out0', toNodeId: 'n3', toPinId: 'in1' },
      { id: 'w7', fromNodeId: 'n2', fromPinId: 'out0', toNodeId: 'n4', toPinId: 'in0' },
      { id: 'w8', fromNodeId: 'n3', fromPinId: 'out0', toNodeId: 'n4', toPinId: 'in1' },
      { id: 'w9', fromNodeId: 'n4', fromPinId: 'out0', toNodeId: 'outY', toPinId: 'in0' },
    ],
  },
  {
    id: 'preset-4bit-rca',
    name: '4-Bit Ripple Carry Adder',
    subtitle: '4 cascaded Full Adders showing carry ripple propagation from C0 → C4 (A=0101 + B=0011 = 1000)',
    nodes: [
      // Bit 0: A0=1, B0=1
      { id: 'a0', kind: 'INPUT', label: 'A0', x: 16, y: 16, value: 1 },
      { id: 'b0', kind: 'INPUT', label: 'B0', x: 16, y: 60, value: 1 },
      { id: 'c0', kind: 'CONST_0', label: 'C0', x: 16, y: 104 },
      { id: 'fa0', kind: 'FULL_ADDER', label: 'FA0', x: 120, y: 24 },
      { id: 's0', kind: 'OUTPUT', label: 'S0', x: 246, y: 18 },
      // Bit 1: A1=0, B1=1
      { id: 'a1', kind: 'INPUT', label: 'A1', x: 16, y: 152, value: 0 },
      { id: 'b1', kind: 'INPUT', label: 'B1', x: 16, y: 196, value: 1 },
      { id: 'fa1', kind: 'FULL_ADDER', label: 'FA1', x: 120, y: 146 },
      { id: 's1', kind: 'OUTPUT', label: 'S1', x: 246, y: 142 },
      // Bit 2: A2=1, B2=0
      { id: 'a2', kind: 'INPUT', label: 'A2', x: 340, y: 16, value: 1 },
      { id: 'b2', kind: 'INPUT', label: 'B2', x: 340, y: 60, value: 0 },
      { id: 'fa2', kind: 'FULL_ADDER', label: 'FA2', x: 444, y: 24 },
      { id: 's2', kind: 'OUTPUT', label: 'S2', x: 566, y: 18 },
      // Bit 3: A3=0, B3=0
      { id: 'a3', kind: 'INPUT', label: 'A3', x: 340, y: 152, value: 0 },
      { id: 'b3', kind: 'INPUT', label: 'B3', x: 340, y: 196, value: 0 },
      { id: 'fa3', kind: 'FULL_ADDER', label: 'FA3', x: 444, y: 146 },
      { id: 's3', kind: 'OUTPUT', label: 'S3', x: 566, y: 136 },
      { id: 'c4', kind: 'OUTPUT', label: 'C4', x: 566, y: 186 },
    ],
    wires: [
      { id: 'w1', fromNodeId: 'a0', fromPinId: 'out0', toNodeId: 'fa0', toPinId: 'in0' },
      { id: 'w2', fromNodeId: 'b0', fromPinId: 'out0', toNodeId: 'fa0', toPinId: 'in1' },
      { id: 'w3', fromNodeId: 'c0', fromPinId: 'out0', toNodeId: 'fa0', toPinId: 'in2' },
      { id: 'w4', fromNodeId: 'fa0', fromPinId: 'out0', toNodeId: 's0', toPinId: 'in0' },
      { id: 'w5', fromNodeId: 'fa0', fromPinId: 'out1', toNodeId: 'fa1', toPinId: 'in2' },

      { id: 'w6', fromNodeId: 'a1', fromPinId: 'out0', toNodeId: 'fa1', toPinId: 'in0' },
      { id: 'w7', fromNodeId: 'b1', fromPinId: 'out0', toNodeId: 'fa1', toPinId: 'in1' },
      { id: 'w8', fromNodeId: 'fa1', fromPinId: 'out0', toNodeId: 's1', toPinId: 'in0' },
      { id: 'w9', fromNodeId: 'fa1', fromPinId: 'out1', toNodeId: 'fa2', toPinId: 'in2' },

      { id: 'w10', fromNodeId: 'a2', fromPinId: 'out0', toNodeId: 'fa2', toPinId: 'in0' },
      { id: 'w11', fromNodeId: 'b2', fromPinId: 'out0', toNodeId: 'fa2', toPinId: 'in1' },
      { id: 'w12', fromNodeId: 'fa2', fromPinId: 'out0', toNodeId: 's2', toPinId: 'in0' },
      { id: 'w13', fromNodeId: 'fa2', fromPinId: 'out1', toNodeId: 'fa3', toPinId: 'in2' },

      { id: 'w14', fromNodeId: 'a3', fromPinId: 'out0', toNodeId: 'fa3', toPinId: 'in0' },
      { id: 'w15', fromNodeId: 'b3', fromPinId: 'out0', toNodeId: 'fa3', toPinId: 'in1' },
      { id: 'w16', fromNodeId: 'fa3', fromPinId: 'out0', toNodeId: 's3', toPinId: 'in0' },
      { id: 'w17', fromNodeId: 'fa3', fromPinId: 'out1', toNodeId: 'c4', toPinId: 'in0' },
    ],
  },
];

// ============================================================================
// 5. SEQUENTIAL CIRCUITS: FLIP-FLOPS & COUNTERS (GATE CORE)
// ============================================================================

export type FlipFlopType = 'SR' | 'JK' | 'D' | 'T';

export interface FlipFlopMeta {
  type: FlipFlopType;
  name: string;
  characteristicEq: string;
  inputs: string[];
  excitationRows: Array<{ q: string; qNext: string; inputs: string }>;
  gateNote: string;
}

export const FLIP_FLOP_META: Record<FlipFlopType, FlipFlopMeta> = {
  SR: {
    type: 'SR',
    name: 'SR Flip-Flop',
    characteristicEq: "Q(t+1) = S + R'·Q(t)   [Constraint: S·R = 0]",
    inputs: ['S', 'R'],
    excitationRows: [
      { q: '0', qNext: '0', inputs: 'S=0, R=X' },
      { q: '0', qNext: '1', inputs: 'S=1, R=0' },
      { q: '1', qNext: '0', inputs: 'S=0, R=1' },
      { q: '1', qNext: '1', inputs: 'S=X, R=0' },
    ],
    gateNote: 'S=1, R=1 is the Invalid/Forbidden state (metastable race when both drop simultaneously).',
  },
  JK: {
    type: 'JK',
    name: 'JK Flip-Flop',
    characteristicEq: "Q(t+1) = J·Q'(t) + K'·Q(t)",
    inputs: ['J', 'K'],
    excitationRows: [
      { q: '0', qNext: '0', inputs: 'J=0, K=X' },
      { q: '0', qNext: '1', inputs: 'J=1, K=X' },
      { q: '1', qNext: '0', inputs: 'J=X, K=1' },
      { q: '1', qNext: '1', inputs: 'J=X, K=0' },
    ],
    gateNote: 'Eliminates SR invalid state: J=1, K=1 toggles Q → Q\'. Watch for Race-Around Condition in level-triggered JK!',
  },
  D: {
    type: 'D',
    name: 'D (Delay / Data) Flip-Flop',
    characteristicEq: 'Q(t+1) = D',
    inputs: ['D'],
    excitationRows: [
      { q: '0', qNext: '0', inputs: 'D=0' },
      { q: '0', qNext: '1', inputs: 'D=1' },
      { q: '1', qNext: '0', inputs: 'D=0' },
      { q: '1', qNext: '1', inputs: 'D=1' },
    ],
    gateNote: 'Transparently captures D on active clock edge. Backbone of shift registers, Ring & Johnson counters.',
  },
  T: {
    type: 'T',
    name: 'T (Toggle) Flip-Flop',
    characteristicEq: 'Q(t+1) = T ⊕ Q(t)',
    inputs: ['T'],
    excitationRows: [
      { q: '0', qNext: '0', inputs: 'T=0' },
      { q: '0', qNext: '1', inputs: 'T=1' },
      { q: '1', qNext: '0', inputs: 'T=1' },
      { q: '1', qNext: '1', inputs: 'T=0' },
    ],
    gateNote: 'Ideal for binary ripple counters & frequency dividers (each T=1 stage divides f_clk by 2).',
  },
};

export function stepFlipFlop(
  type: FlipFlopType,
  q: LogicBit,
  in1: LogicBit,
  in2: LogicBit = 0
): { nextQ: LogicBit; invalid: boolean; action: string } {
  switch (type) {
    case 'SR': {
      const s = in1;
      const r = in2;
      if (s === 0 && r === 0) return { nextQ: q, invalid: false, action: 'Hold (No Change)' };
      if (s === 0 && r === 1) return { nextQ: 0, invalid: false, action: 'Reset (Q ← 0)' };
      if (s === 1 && r === 0) return { nextQ: 1, invalid: false, action: 'Set (Q ← 1)' };
      return { nextQ: q, invalid: true, action: 'INVALID (S=1, R=1 Forbidden!)' };
    }
    case 'JK': {
      const j = in1;
      const k = in2;
      if (j === 0 && k === 0) return { nextQ: q, invalid: false, action: 'Hold (No Change)' };
      if (j === 0 && k === 1) return { nextQ: 0, invalid: false, action: 'Reset (Q ← 0)' };
      if (j === 1 && k === 0) return { nextQ: 1, invalid: false, action: 'Set (Q ← 1)' };
      return { nextQ: q ? 0 : 1, invalid: false, action: 'Toggle (Q ← Q\')' };
    }
    case 'D': {
      return {
        nextQ: in1,
        invalid: false,
        action: in1 === 1 ? 'Load 1 (Q ← D=1)' : 'Load 0 (Q ← D=0)',
      };
    }
    case 'T': {
      if (in1 === 0) return { nextQ: q, invalid: false, action: 'Hold (T=0)' };
      return { nextQ: q ? 0 : 1, invalid: false, action: 'Toggle (T=1, Q ← Q\')' };
    }
  }
}

export type CounterPresetId =
  | 'mod6_ripple'
  | 'johnson_3'
  | 'ring_4'
  | 'mod5_sync'
  | 'lockout_demo'
  | 'custom';

export interface CounterPreset {
  id: CounterPresetId;
  name: string;
  bits: 2 | 3 | 4;
  kind: 'Ripple (Async)' | 'Synchronous';
  initialState: number;
  /** Full next-state table for all 2^bits states */
  nextStateMap: Record<number, number>;
  description: string;
}

export interface CounterAnalysis {
  bits: 2 | 3 | 4;
  initialState: number;
  mainCycle: number[];
  modulus: number;
  unusedStates: number[];
  lockoutStates: number[]; // unused states that never return to mainCycle
  isSelfStarting: boolean;
  outputFreqLabel: string;
  nextStateMap: Record<number, number>;
}

export function buildCounterFromSequence(
  bits: 2 | 3 | 4,
  rawSequence: string,
  selfStarting = true
): CounterPreset {
  const maxState = (1 << bits) - 1;
  const parsed = rawSequence
    .split(/[\s,→>-]+/)
    .map((x) => Number(x.trim()))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= maxState);

  const uniqueCycle: number[] = [];
  for (const s of parsed) {
    if (!uniqueCycle.includes(s)) uniqueCycle.push(s);
  }
  if (uniqueCycle.length === 0) uniqueCycle.push(0, 1);

  const nextStateMap: Record<number, number> = {};
  for (let i = 0; i < uniqueCycle.length; i++) {
    nextStateMap[uniqueCycle[i]] = uniqueCycle[(i + 1) % uniqueCycle.length];
  }
  for (let s = 0; s <= maxState; s++) {
    if (!(s in nextStateMap)) {
      nextStateMap[s] = selfStarting ? uniqueCycle[0] : s;
    }
  }

  return {
    id: 'custom',
    name: `Custom ${bits}-bit MOD-${uniqueCycle.length}`,
    bits,
    kind: 'Synchronous',
    initialState: uniqueCycle[0],
    nextStateMap,
    description: `Custom sequence: ${uniqueCycle.join(' → ')} → ${uniqueCycle[0]}`,
  };
}

export const GATE_COUNTER_PRESETS: CounterPreset[] = [
  {
    id: 'mod6_ripple',
    name: 'MOD-6 Ripple Counter (3-bit)',
    bits: 3,
    kind: 'Ripple (Async)',
    initialState: 0,
    nextStateMap: { 0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: 0, 6: 0, 7: 0 },
    description: 'Counts 000 → 101; asynchronous NAND reset clears state 6 (110) immediately back to 000.',
  },
  {
    id: 'johnson_3',
    name: '3-bit Johnson (Twisted Ring) — MOD-6',
    bits: 3,
    kind: 'Synchronous',
    initialState: 0,
    // Q2_next = ~Q0, Q1_next = Q2, Q0_next = Q1
    // Main cycle (2n = 6): 000(0)->100(4)->110(6)->111(7)->011(3)->001(1)->000
    // Lockout cycle: 010(2) <-> 101(5)
    nextStateMap: { 0: 4, 4: 6, 6: 7, 7: 3, 3: 1, 1: 0, 2: 5, 5: 2 },
    description: '3-FF Twisted Ring has MOD = 2n = 6 states and a classic 2-state lockout cycle (010 ↔ 101)!',
  },
  {
    id: 'ring_4',
    name: '4-bit Ring Counter — MOD-4',
    bits: 4,
    kind: 'Synchronous',
    initialState: 8,
    // Rotate right: 1000(8)->0100(4)->0010(2)->0001(1)->1000
    nextStateMap: {
      8: 4,
      4: 2,
      2: 1,
      1: 8,
      0: 0,
      3: 9,
      9: 12,
      12: 6,
      6: 3,
      5: 10,
      10: 5,
      7: 11,
      11: 13,
      13: 14,
      14: 7,
      15: 15,
    },
    description: '4-FF Ring Counter gives MOD = n = 4 (f_clk/4) with 12 unused states forming lockout loops unless self-correcting.',
  },
  {
    id: 'mod5_sync',
    name: 'MOD-5 Self-Starting Sync (3-bit)',
    bits: 3,
    kind: 'Synchronous',
    initialState: 0,
    nextStateMap: { 0: 1, 1: 2, 2: 3, 3: 4, 4: 0, 5: 0, 6: 0, 7: 0 },
    description: 'All unused states (5, 6, 7) transition cleanly into 000 on the next clock pulse (Self-Starting).',
  },
];

export function analyzeCounter(preset: CounterPreset): CounterAnalysis {
  const totalStates = 1 << preset.bits;
  const visitedOrder: number[] = [];
  const seenAt = new Map<number, number>();
  let curr = preset.initialState;

  while (!seenAt.has(curr)) {
    seenAt.set(curr, visitedOrder.length);
    visitedOrder.push(curr);
    curr = preset.nextStateMap[curr] ?? 0;
  }

  const cycleStart = seenAt.get(curr) ?? 0;
  const mainCycle = visitedOrder.slice(cycleStart);
  const mainSet = new Set(mainCycle);
  const unusedStates: number[] = [];
  const lockoutStates: number[] = [];

  for (let s = 0; s < totalStates; s++) {
    if (mainSet.has(s)) continue;
    unusedStates.push(s);
    // Trace from s to check whether it eventually enters mainCycle
    let probe = s;
    const localSeen = new Set<number>();
    let reachesMain = false;
    while (!localSeen.has(probe)) {
      if (mainSet.has(probe)) {
        reachesMain = true;
        break;
      }
      localSeen.add(probe);
      probe = preset.nextStateMap[probe] ?? 0;
    }
    if (!reachesMain) {
      lockoutStates.push(s);
    }
  }

  const modulus = mainCycle.length;
  return {
    bits: preset.bits,
    initialState: preset.initialState,
    mainCycle,
    modulus,
    unusedStates,
    lockoutStates,
    isSelfStarting: lockoutStates.length === 0,
    outputFreqLabel: `f_clk / ${modulus}`,
    nextStateMap: preset.nextStateMap,
  };
}
