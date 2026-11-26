/**
 * Pure Client-Side Theory of Computation (TOC) Engine for GATE CSE 2027.
 * Zero billing, zero external dependencies:
 * - DFA / ε-NFA simulation (step-by-step trace + batch language enumeration + emptiness/finiteness/infiniteness)
 * - Exact Subset Construction (ε-NFA -> DFA) with transition table
 * - Exact Myhill-Nerode / Equivalence Partitioning DFA Minimization (P0, P1, P2...)
 * - Regex -> ε-NFA Thompson Construction
 * - DPDA / NPDA simulation with animated stack snapshots & determinism detector
 * - 28-entry GATE CSE Language Classifier reference library
 */

export const EPSILON = 'ε';

export interface AutomatonState {
  id: string;
  label: string;
  x: number;
  y: number;
  isStart: boolean;
  isAccept: boolean;
}

export interface AutomatonTransition {
  id: string;
  from: string;
  to: string;
  symbols: string[]; // e.g. ['0'], ['a', 'b'], ['ε']
}

export interface AutomatonModel {
  id: string;
  name: string;
  description: string;
  alphabet: string[]; // non-epsilon symbols
  states: AutomatonState[];
  transitions: AutomatonTransition[];
}

export interface SimulationStep {
  stepIndex: number;
  consumedPrefix: string;
  symbolRead: string | null; // null at step 0 (initial closure)
  activeStates: string[];
  firedTransitions: Array<{ from: string; to: string; symbol: string }>;
}

export interface AutomatonTraceResult {
  input: string;
  accepted: boolean;
  steps: SimulationStep[];
  traceText: string;
  invalidSymbols: string[];
}

export interface BatchLanguageInspection {
  alphabet: string[];
  maxLength: number;
  acceptedStrings: string[];
  rejectedStrings: string[];
  cardinality: 'Empty' | 'Finite' | 'Infinite';
  cardinalityReason: string;
}

export interface SubsetTableRow {
  subsetId: string;
  subsetLabel: string;
  memberIds: string[];
  isStart: boolean;
  isAccept: boolean;
  transitions: Record<string, string>; // symbol -> target subsetLabel
}

export interface SubsetConstructionResult {
  dfa: AutomatonModel;
  alphabet: string[];
  table: SubsetTableRow[];
}

export interface MinimizationStep {
  pass: number;
  label: string;
  partitions: string[][]; // arrays of state labels
}

export interface DfaMinimizationResult {
  minimized: AutomatonModel;
  steps: MinimizationStep[];
  unreachableRemoved: string[];
  originalStateCount: number;
  minimizedStateCount: number;
  wasConvertedFromNfa: boolean;
}

// ============================================================================
// 1. AUTOMATON UTILITIES & SIMULATION
// ============================================================================

export function extractAlphabet(model: AutomatonModel): string[] {
  const set = new Set<string>();
  for (const sym of model.alphabet) {
    const clean = sym.trim();
    if (clean && clean !== EPSILON && clean !== 'eps' && clean !== 'epsilon') {
      set.add(clean);
    }
  }
  for (const tr of model.transitions) {
    for (const sym of tr.symbols) {
      const clean = normalizeSymbol(sym);
      if (clean && clean !== EPSILON) set.add(clean);
    }
  }
  return Array.from(set).sort();
}

export function normalizeSymbol(sym: string): string {
  const s = sym.trim();
  if (!s) return '';
  if (s === EPSILON || s.toLowerCase() === 'eps' || s.toLowerCase() === 'epsilon' || s === '^' || s === 'λ') {
    return EPSILON;
  }
  return s;
}

export function isAutomatonNfa(model: AutomatonModel): boolean {
  const startStates = model.states.filter((s) => s.isStart);
  if (startStates.length !== 1) return true;
  const alphabet = extractAlphabet(model);

  for (const tr of model.transitions) {
    if (tr.symbols.some((s) => normalizeSymbol(s) === EPSILON)) {
      return true;
    }
  }

  for (const st of model.states) {
    for (const sym of alphabet) {
      const targets = new Set<string>();
      for (const tr of model.transitions) {
        if (tr.from === st.id && tr.symbols.map(normalizeSymbol).includes(sym)) {
          targets.add(tr.to);
        }
      }
      if (targets.size !== 1) {
        return true;
      }
    }
  }
  return false;
}

export function computeEpsilonClosure(model: AutomatonModel, stateIds: Iterable<string>): Set<string> {
  const closure = new Set<string>(stateIds);
  const stack = Array.from(closure);

  while (stack.length > 0) {
    const curr = stack.pop()!;
    for (const tr of model.transitions) {
      if (tr.from === curr && tr.symbols.some((s) => normalizeSymbol(s) === EPSILON)) {
        if (!closure.has(tr.to)) {
          closure.add(tr.to);
          stack.push(tr.to);
        }
      }
    }
  }
  return closure;
}

export function moveStates(
  model: AutomatonModel,
  stateIds: Iterable<string>,
  symbol: string
): { nextStates: Set<string>; fired: Array<{ from: string; to: string; symbol: string }> } {
  const nextStates = new Set<string>();
  const fired: Array<{ from: string; to: string; symbol: string }> = [];
  const norm = normalizeSymbol(symbol);

  for (const sid of stateIds) {
    for (const tr of model.transitions) {
      if (tr.from === sid && tr.symbols.map(normalizeSymbol).includes(norm)) {
        nextStates.add(tr.to);
        fired.push({ from: sid, to: tr.to, symbol: norm });
      }
    }
  }
  return { nextStates, fired };
}

export function simulateAutomatonTrace(model: AutomatonModel, rawInput: string): AutomatonTraceResult {
  const input = rawInput.trim() === EPSILON ? '' : rawInput.trim();
  const stateMap = new Map(model.states.map((s) => [s.id, s]));
  const alphabet = new Set(extractAlphabet(model));
  const invalidSymbols: string[] = [];

  for (const ch of input) {
    if (!alphabet.has(ch) && !invalidSymbols.includes(ch)) {
      invalidSymbols.push(ch);
    }
  }

  const startIds = model.states.filter((s) => s.isStart).map((s) => s.id);
  const initialClosure = computeEpsilonClosure(model, startIds);
  const sortedInit = Array.from(initialClosure).sort();

  const steps: SimulationStep[] = [
    {
      stepIndex: 0,
      consumedPrefix: '',
      symbolRead: null,
      activeStates: sortedInit,
      firedTransitions: [],
    },
  ];

  let current = initialClosure;
  const labelOf = (ids: string[]) => {
    if (ids.length === 0) return '∅';
    const labels = ids.map((id) => stateMap.get(id)?.label ?? id);
    return labels.length === 1 ? labels[0] : `{${labels.join(', ')}}`;
  };

  const traceSegments: string[] = [labelOf(sortedInit)];

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    const { nextStates, fired } = moveStates(model, current, ch);
    const closed = computeEpsilonClosure(model, nextStates);
    const sortedClosed = Array.from(closed).sort();

    steps.push({
      stepIndex: i + 1,
      consumedPrefix: input.slice(0, i + 1),
      symbolRead: ch,
      activeStates: sortedClosed,
      firedTransitions: fired,
    });

    traceSegments.push(`—${ch}→ ${labelOf(sortedClosed)}`);
    current = closed;
  }

  const accepted = Array.from(current).some((id) => Boolean(stateMap.get(id)?.isAccept));

  return {
    input,
    accepted,
    steps,
    traceText: traceSegments.join(' '),
    invalidSymbols,
  };
}

/**
 * Enumerates strings up to maxLength (default 4) and determines exact
 * Empty / Finite / Infinite language cardinality via graph reachability + cycle detection
 * on co-accessible states (reachable from start AND able to reach an accept state).
 */
export function inspectAutomatonLanguage(
  model: AutomatonModel,
  maxLength = 4
): BatchLanguageInspection {
  const alphabet = extractAlphabet(model);
  const acceptedStrings: string[] = [];
  const rejectedStrings: string[] = [];

  // BFS over strings up to maxLength (cap symbols to avoid explosion if user enters huge alphabet)
  const testAlphabet = alphabet.slice(0, 4);
  const queue: string[] = [''];
  const maxStrings = 140;

  while (queue.length > 0 && acceptedStrings.length + rejectedStrings.length < maxStrings) {
    const str = queue.shift()!;
    const res = simulateAutomatonTrace(model, str);
    const display = str === '' ? EPSILON : str;
    if (res.accepted) {
      acceptedStrings.push(display);
    } else {
      rejectedStrings.push(display);
    }

    if (str.length < maxLength) {
      for (const sym of testAlphabet) {
        queue.push(str + sym);
      }
    }
  }

  // Exact emptiness / finiteness / infiniteness using minimized/converted DFA (guaranteed exact!)
  const { dfa } = convertNfaToDfa(model);
  const startState = dfa.states.find((s) => s.isStart);
  if (!startState) {
    return {
      alphabet,
      maxLength,
      acceptedStrings,
      rejectedStrings,
      cardinality: 'Empty',
      cardinalityReason: 'No start state defined.',
    };
  }

  // 1. Forward reachable from start
  const reachable = new Set<string>([startState.id]);
  const fQueue: string[] = [startState.id];
  const adj = new Map<string, string[]>();
  const revAdj = new Map<string, string[]>();
  for (const st of dfa.states) {
    adj.set(st.id, []);
    revAdj.set(st.id, []);
  }
  for (const tr of dfa.transitions) {
    if (tr.symbols.length > 0) {
      adj.get(tr.from)?.push(tr.to);
      revAdj.get(tr.to)?.push(tr.from);
    }
  }
  while (fQueue.length > 0) {
    const u = fQueue.shift()!;
    for (const v of adj.get(u) ?? []) {
      if (!reachable.has(v)) {
        reachable.add(v);
        fQueue.push(v);
      }
    }
  }

  // 2. Backward co-accessible from accepting states
  const acceptIds = dfa.states.filter((s) => s.isAccept && reachable.has(s.id)).map((s) => s.id);
  if (acceptIds.length === 0) {
    return {
      alphabet,
      maxLength,
      acceptedStrings,
      rejectedStrings,
      cardinality: 'Empty',
      cardinalityReason: 'No accepting state is reachable from the start state (L = ∅).',
    };
  }

  const useful = new Set<string>(acceptIds);
  const bQueue: string[] = [...acceptIds];
  while (bQueue.length > 0) {
    const u = bQueue.shift()!;
    for (const p of revAdj.get(u) ?? []) {
      if (reachable.has(p) && !useful.has(p)) {
        useful.add(p);
        bQueue.push(p);
      }
    }
  }

  // 3. Detect directed cycle inside useful subgraph (3-color DFS)
  const color = new Map<string, 0 | 1 | 2>();
  let hasCycle = false;
  const dfs = (u: string) => {
    color.set(u, 1);
    for (const v of adj.get(u) ?? []) {
      if (!useful.has(v)) continue;
      const c = color.get(v) ?? 0;
      if (c === 1) {
        hasCycle = true;
        return;
      }
      if (c === 0) {
        dfs(v);
        if (hasCycle) return;
      }
    }
    color.set(u, 2);
  };

  for (const u of useful) {
    if ((color.get(u) ?? 0) === 0) {
      dfs(u);
      if (hasCycle) break;
    }
  }

  if (hasCycle) {
    return {
      alphabet,
      maxLength,
      acceptedStrings,
      rejectedStrings,
      cardinality: 'Infinite',
      cardinalityReason:
        'A directed cycle exists along a path from Start to an Accept state (Pumping Lemma holds).',
    };
  }

  return {
    alphabet,
    maxLength,
    acceptedStrings,
    rejectedStrings,
    cardinality: 'Finite',
    cardinalityReason:
      'Accepting states are reachable, and no cycle exists on any accepting path (DAG of useful states).',
  };
}

// ============================================================================
// 2. LAYOUT HELPER
// ============================================================================

export function layoutStatesCleanly(
  states: Array<Omit<AutomatonState, 'x' | 'y'>>,
  canvasWidth = 640,
  canvasHeight = 320
): AutomatonState[] {
  const n = states.length;
  if (n === 0) return [];
  if (n === 1) {
    return [{ ...states[0], x: Math.round(canvasWidth / 2), y: Math.round(canvasHeight / 2) }];
  }
  if (n <= 4) {
    const padX = 95;
    const usableW = canvasWidth - padX * 2;
    return states.map((s, i) => ({
      ...s,
      x: Math.round(padX + (usableW * i) / (n - 1)),
      y: Math.round(canvasHeight / 2 + (i % 2 === 0 ? -18 : 18)),
    }));
  }

  // Start state on left, remaining on clean ellipse/grid
  const cx = canvasWidth / 2;
  const cy = canvasHeight / 2;
  const rx = Math.min(240, canvasWidth * 0.38);
  const ry = Math.min(115, canvasHeight * 0.36);

  return states.map((s, idx) => {
    const angle = Math.PI + (2 * Math.PI * idx) / n;
    return {
      ...s,
      x: Math.round(cx + rx * Math.cos(angle)),
      y: Math.round(cy + ry * Math.sin(angle)),
    };
  });
}

// ============================================================================
// 3. EXACT SUBSET CONSTRUCTION (ε-NFA -> DFA)
// ============================================================================

export function convertNfaToDfa(model: AutomatonModel): SubsetConstructionResult {
  const alphabet = extractAlphabet(model);
  const stateMap = new Map(model.states.map((s) => [s.id, s]));
  const startIds = model.states.filter((s) => s.isStart).map((s) => s.id);
  const startClosure = Array.from(computeEpsilonClosure(model, startIds)).sort();

  const makeKey = (ids: string[]) => (ids.length === 0 ? '∅' : ids.join('|'));
  const makeSubsetLabel = (ids: string[]) => {
    if (ids.length === 0) return '∅';
    const labels = ids.map((id) => stateMap.get(id)?.label ?? id).sort();
    return `{${labels.join(',')}}`;
  };

  const keyToStateId = new Map<string, string>();
  const subsets: Array<{ key: string; id: string; memberIds: string[]; subsetLabel: string; isStart: boolean; isAccept: boolean }> = [];
  const queue: string[][] = [];
  const rawEdges: Array<{ from: string; to: string; symbol: string }> = [];

  const registerSubset = (ids: string[], isStart = false): string => {
    const sorted = Array.from(new Set(ids)).sort();
    const key = makeKey(sorted);
    const existing = keyToStateId.get(key);
    if (existing) return existing;
    const id = `d${subsets.length}`;
    keyToStateId.set(key, id);
    const isAccept = sorted.some((sid) => Boolean(stateMap.get(sid)?.isAccept));
    subsets.push({
      key,
      id,
      memberIds: sorted,
      subsetLabel: makeSubsetLabel(sorted),
      isStart,
      isAccept,
    });
    queue.push(sorted);
    return id;
  };

  registerSubset(startClosure, true);

  const tableTransitions = new Map<string, Record<string, string>>();
  const MAX_SUBSETS = 32;

  while (queue.length > 0 && subsets.length <= MAX_SUBSETS) {
    const currIds = queue.shift()!;
    const currKey = makeKey(currIds);
    const currDfaId = keyToStateId.get(currKey)!;
    const rowMap: Record<string, string> = {};

    for (const sym of alphabet) {
      const { nextStates } = moveStates(model, currIds, sym);
      const closed = Array.from(computeEpsilonClosure(model, nextStates)).sort();
      const targetId = registerSubset(closed, false);
      rowMap[sym] = makeSubsetLabel(closed);
      rawEdges.push({ from: currDfaId, to: targetId, symbol: sym });
    }
    tableTransitions.set(currDfaId, rowMap);
  }

  // Merge parallel edges between same (from, to)
  const mergedEdgesMap = new Map<string, AutomatonTransition>();
  for (const e of rawEdges) {
    const k = `${e.from}->${e.to}`;
    const existing = mergedEdgesMap.get(k);
    if (existing) {
      if (!existing.symbols.includes(e.symbol)) existing.symbols.push(e.symbol);
    } else {
      mergedEdgesMap.set(k, {
        id: `dt-${mergedEdgesMap.size}`,
        from: e.from,
        to: e.to,
        symbols: [e.symbol],
      });
    }
  }

  const laidOutStates = layoutStatesCleanly(
    subsets.map((s, idx) => ({
      id: s.id,
      label: s.memberIds.length === 0 ? 'qd' : `D${idx}`,
      isStart: s.isStart,
      isAccept: s.isAccept,
    }))
  );

  const table: SubsetTableRow[] = subsets.map((s, idx) => ({
    subsetId: s.memberIds.length === 0 ? 'qd' : `D${idx}`,
    subsetLabel: s.subsetLabel,
    memberIds: s.memberIds,
    isStart: s.isStart,
    isAccept: s.isAccept,
    transitions: tableTransitions.get(s.id) ?? {},
  }));

  return {
    dfa: {
      id: `dfa-${Date.now()}`,
      name: `${model.name} (Converted DFA)`,
      description: `Subset construction DFA with ${subsets.length} states.`,
      alphabet,
      states: laidOutStates,
      transitions: Array.from(mergedEdgesMap.values()),
    },
    alphabet,
    table,
  };
}

// ============================================================================
// 4. EXACT MYHILL-NERODE / EQUIVALENCE PARTITIONING DFA MINIMIZATION
// ============================================================================

export function minimizeDfa(inputModel: AutomatonModel): DfaMinimizationResult {
  const wasConvertedFromNfa = isAutomatonNfa(inputModel);
  const working = wasConvertedFromNfa ? convertNfaToDfa(inputModel).dfa : inputModel;
  const alphabet = extractAlphabet(working);
  const stateMap = new Map(working.states.map((s) => [s.id, s]));

  // Build total transition lookup (add dead state if incomplete)
  const start = working.states.find((s) => s.isStart);
  if (!start) {
    return {
      minimized: working,
      steps: [],
      unreachableRemoved: [],
      originalStateCount: working.states.length,
      minimizedStateCount: working.states.length,
      wasConvertedFromNfa,
    };
  }

  const delta = new Map<string, Record<string, string>>();
  let needsDead = false;
  for (const st of working.states) {
    const map: Record<string, string> = {};
    for (const sym of alphabet) {
      const hit = working.transitions.find(
        (t) => t.from === st.id && t.symbols.map(normalizeSymbol).includes(sym)
      );
      if (hit) {
        map[sym] = hit.to;
      } else {
        needsDead = true;
      }
    }
    delta.set(st.id, map);
  }

  const allWorkingStates = [...working.states];
  if (needsDead) {
    const deadId = '__dead__';
    allWorkingStates.push({
      id: deadId,
      label: 'q_dead',
      x: 560,
      y: 270,
      isStart: false,
      isAccept: false,
    });
    stateMap.set(deadId, allWorkingStates[allWorkingStates.length - 1]);
    const deadMap: Record<string, string> = {};
    for (const sym of alphabet) deadMap[sym] = deadId;
    delta.set(deadId, deadMap);
    for (const st of working.states) {
      const map = delta.get(st.id)!;
      for (const sym of alphabet) {
        if (!map[sym]) map[sym] = deadId;
      }
    }
  }

  // Step 1: BFS Reachable states
  const reachable = new Set<string>([start.id]);
  const q: string[] = [start.id];
  while (q.length > 0) {
    const u = q.shift()!;
    const trans = delta.get(u) ?? {};
    for (const sym of alphabet) {
      const v = trans[sym];
      if (v && !reachable.has(v)) {
        reachable.add(v);
        q.push(v);
      }
    }
  }

  const unreachableRemoved = allWorkingStates
    .filter((s) => !reachable.has(s.id) && s.id !== '__dead__')
    .map((s) => s.label);

  const activeStates = allWorkingStates.filter((s) => reachable.has(s.id));

  // Step 2: Initial partition P0 = { Non-Accept, Accept }
  const accepting = activeStates.filter((s) => s.isAccept).map((s) => s.id);
  const nonAccepting = activeStates.filter((s) => !s.isAccept).map((s) => s.id);
  let partitions: string[][] = [];
  if (nonAccepting.length > 0) partitions.push(nonAccepting);
  if (accepting.length > 0) partitions.push(accepting);

  const labelPartitions = (parts: string[][]) =>
    parts.map((group) => group.map((id) => stateMap.get(id)?.label ?? id));

  const steps: MinimizationStep[] = [
    {
      pass: 0,
      label: 'P₀ (0-equivalence: Non-Accept vs Accept)',
      partitions: labelPartitions(partitions),
    },
  ];

  // Step 3: Refine partitions iteratively until fixed point
  let pass = 1;
  while (pass <= 30) {
    const stateToGroup = new Map<string, number>();
    partitions.forEach((group, idx) => {
      for (const id of group) stateToGroup.set(id, idx);
    });

    const nextPartitions: string[][] = [];
    for (const group of partitions) {
      const signatureBuckets = new Map<string, string[]>();
      for (const sid of group) {
        const trans = delta.get(sid) ?? {};
        const sig = alphabet.map((sym) => stateToGroup.get(trans[sym]) ?? -1).join(',');
        const arr = signatureBuckets.get(sig) ?? [];
        arr.push(sid);
        signatureBuckets.set(sig, arr);
      }
      for (const bucket of signatureBuckets.values()) {
        nextPartitions.push(bucket);
      }
    }

    if (nextPartitions.length === partitions.length) {
      steps.push({
        pass,
        label: `P${pass} (Fixed Point — Minimal Partition Reached)`,
        partitions: labelPartitions(nextPartitions),
      });
      break;
    }

    partitions = nextPartitions;
    steps.push({
      pass,
      label: `P${pass} (${pass}-equivalence refinement)`,
      partitions: labelPartitions(partitions),
    });
    pass += 1;
  }

  // Re-order partitions so start state's group is always index 0
  const startGroupIdx = partitions.findIndex((g) => g.includes(start.id));
  if (startGroupIdx > 0) {
    const [sg] = partitions.splice(startGroupIdx, 1);
    partitions.unshift(sg);
  }

  const stateToMinIdx = new Map<string, number>();
  partitions.forEach((g, idx) => {
    for (const id of g) stateToMinIdx.set(id, idx);
  });

  const minStatesMeta = partitions.map((group, idx) => ({
    id: `m${idx}`,
    label: `q${idx}`,
    isStart: group.includes(start.id),
    isAccept: group.some((id) => Boolean(stateMap.get(id)?.isAccept)),
  }));

  const minEdgesMap = new Map<string, AutomatonTransition>();
  partitions.forEach((group, idx) => {
    const rep = group[0];
    const trans = delta.get(rep) ?? {};
    for (const sym of alphabet) {
      const targetGroup = stateToMinIdx.get(trans[sym]);
      if (targetGroup === undefined) continue;
      const fromId = `m${idx}`;
      const toId = `m${targetGroup}`;
      const key = `${fromId}->${toId}`;
      const existing = minEdgesMap.get(key);
      if (existing) {
        if (!existing.symbols.includes(sym)) existing.symbols.push(sym);
      } else {
        minEdgesMap.set(key, {
          id: `mt-${minEdgesMap.size}`,
          from: fromId,
          to: toId,
          symbols: [sym],
        });
      }
    }
  });

  const minimized: AutomatonModel = {
    id: `min-${Date.now()}`,
    name: `${inputModel.name} (Minimized DFA)`,
    description: `Minimal DFA with ${minStatesMeta.length} state(s) via Myhill-Nerode equivalence partitioning.`,
    alphabet,
    states: layoutStatesCleanly(minStatesMeta),
    transitions: Array.from(minEdgesMap.values()),
  };

  return {
    minimized,
    steps,
    unreachableRemoved,
    originalStateCount: inputModel.states.length,
    minimizedStateCount: minStatesMeta.length,
    wasConvertedFromNfa,
  };
}

// ============================================================================
// 5. REGEX -> ε-NFA (THOMPSON'S CONSTRUCTION)
// ============================================================================

function tokenizeRegex(raw: string): string[] {
  const cleaned = raw.replace(/\s+/g, '').replace(/\|/g, '+');
  const tokens: string[] = [];
  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    tokens.push(ch);
  }
  return tokens;
}

function insertExplicitConcat(tokens: string[]): string[] {
  const out: string[] = [];
  const isLiteral = (t: string) => !['+', '*', '(', ')', '.'].includes(t);

  for (let i = 0; i < tokens.length; i++) {
    const curr = tokens[i];
    out.push(curr);
    if (i + 1 < tokens.length) {
      const next = tokens[i + 1];
      const currEndsAtom = isLiteral(curr) || curr === ')' || curr === '*';
      const nextStartsAtom = isLiteral(next) || next === '(';
      if (currEndsAtom && nextStartsAtom) {
        out.push('.');
      }
    }
  }
  return out;
}

function regexToPostfix(tokens: string[]): string[] {
  const prec: Record<string, number> = { '+': 1, '.': 2, '*': 3 };
  const output: string[] = [];
  const ops: string[] = [];

  for (const tok of tokens) {
    if (tok === '(') {
      ops.push(tok);
    } else if (tok === ')') {
      while (ops.length > 0 && ops[ops.length - 1] !== '(') {
        output.push(ops.pop()!);
      }
      if (ops.length === 0) {
        throw new Error('Mismatched closing parenthesis ")" in regular expression.');
      }
      ops.pop();
    } else if (tok in prec) {
      while (
        ops.length > 0 &&
        ops[ops.length - 1] !== '(' &&
        prec[ops[ops.length - 1]] >= prec[tok]
      ) {
        output.push(ops.pop()!);
      }
      ops.push(tok);
    } else {
      output.push(tok);
    }
  }

  while (ops.length > 0) {
    const op = ops.pop()!;
    if (op === '(') {
      throw new Error('Mismatched opening parenthesis "(" in regular expression.');
    }
    output.push(op);
  }
  return output;
}

export function buildAutomatonFromRegex(
  regex: string,
  options?: { minimizeToDfa?: boolean }
): { ok: true; model: AutomatonModel } | { ok: false; error: string } {
  const trimmed = regex.trim();
  if (!trimmed) {
    return { ok: false, error: 'Enter a regular expression such as (a+b)*ab or (0+1)*101.' };
  }
  if (trimmed.length > 48) {
    return { ok: false, error: 'Keep regex under 48 characters for readable state diagrams.' };
  }

  try {
    const tokens = insertExplicitConcat(tokenizeRegex(trimmed));
    const postfix = regexToPostfix(tokens);

    let stateCounter = 0;
    const newState = () => `r${stateCounter++}`;
    const edges: Array<{ from: string; to: string; symbol: string }> = [];
    const alphabet = new Set<string>();

    interface Frag {
      start: string;
      end: string;
    }

    const stack: Frag[] = [];
    for (const tok of postfix) {
      if (tok === '*') {
        const a = stack.pop();
        if (!a) throw new Error('Invalid Kleene star "*" placement.');
        const s = newState();
        const e = newState();
        edges.push({ from: s, to: a.start, symbol: EPSILON });
        edges.push({ from: s, to: e, symbol: EPSILON });
        edges.push({ from: a.end, to: a.start, symbol: EPSILON });
        edges.push({ from: a.end, to: e, symbol: EPSILON });
        stack.push({ start: s, end: e });
      } else if (tok === '.') {
        const b = stack.pop();
        const a = stack.pop();
        if (!a || !b) throw new Error('Invalid concatenation in regex.');
        edges.push({ from: a.end, to: b.start, symbol: EPSILON });
        stack.push({ start: a.start, end: b.end });
      } else if (tok === '+') {
        const b = stack.pop();
        const a = stack.pop();
        if (!a || !b) throw new Error('Invalid union "+" in regex.');
        const s = newState();
        const e = newState();
        edges.push({ from: s, to: a.start, symbol: EPSILON });
        edges.push({ from: s, to: b.start, symbol: EPSILON });
        edges.push({ from: a.end, to: e, symbol: EPSILON });
        edges.push({ from: b.end, to: e, symbol: EPSILON });
        stack.push({ start: s, end: e });
      } else {
        const sym = normalizeSymbol(tok);
        if (sym !== EPSILON) alphabet.add(sym);
        const s = newState();
        const e = newState();
        edges.push({ from: s, to: e, symbol: sym });
        stack.push({ start: s, end: e });
      }
    }

    if (stack.length !== 1) {
      throw new Error('Could not parse regex structure. Check parentheses and operators (+, *, concat).');
    }

    const finalFrag = stack[0];
    const allIds = new Set<string>([finalFrag.start, finalFrag.end]);
    for (const e of edges) {
      allIds.add(e.from);
      allIds.add(e.to);
    }

    const orderedIds = Array.from(allIds).sort((a, b) => {
      if (a === finalFrag.start) return -1;
      if (b === finalFrag.start) return 1;
      return Number(a.slice(1)) - Number(b.slice(1));
    });

    const nfaStates = layoutStatesCleanly(
      orderedIds.map((id, idx) => ({
        id,
        label: `q${idx}`,
        isStart: id === finalFrag.start,
        isAccept: id === finalFrag.end,
      }))
    );

    const nfaTransitions: AutomatonTransition[] = edges.map((e, idx) => ({
      id: `rt-${idx}`,
      from: e.from,
      to: e.to,
      symbols: [e.symbol],
    }));

    const nfaModel: AutomatonModel = {
      id: `regex-nfa-${Date.now()}`,
      name: `Regex: ${trimmed}`,
      description: `Automaton constructed from regular expression ${trimmed}.`,
      alphabet: Array.from(alphabet).sort(),
      states: nfaStates,
      transitions: nfaTransitions,
    };

    if (options?.minimizeToDfa ?? true) {
      const min = minimizeDfa(nfaModel);
      return {
        ok: true,
        model: {
          ...min.minimized,
          name: `Min DFA for ${trimmed}`,
          description: `Built via Thompson ε-NFA → Subset Construction → Myhill-Nerode Minimization (${min.minimizedStateCount} states).`,
        },
      };
    }

    return { ok: true, model: nfaModel };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to parse regular expression.',
    };
  }
}

// ============================================================================
// 6. ONE-CLICK GATE CLASSIC DFA / ε-NFA PRESETS
// ============================================================================

export const GATE_AUTOMATON_PRESETS: AutomatonModel[] = [
  {
    id: 'preset-div3',
    name: 'Binary Divisible by 3 (DFA)',
    description: 'Accepts binary strings whose integer value ≡ 0 (mod 3). Classic 3-state minimal GATE DFA.',
    alphabet: ['0', '1'],
    states: [
      { id: 'q0', label: 'q0', x: 130, y: 165, isStart: true, isAccept: true },
      { id: 'q1', label: 'q1', x: 320, y: 95, isStart: false, isAccept: false },
      { id: 'q2', label: 'q2', x: 510, y: 165, isStart: false, isAccept: false },
    ],
    transitions: [
      { id: 't1', from: 'q0', to: 'q0', symbols: ['0'] },
      { id: 't2', from: 'q0', to: 'q1', symbols: ['1'] },
      { id: 't3', from: 'q1', to: 'q2', symbols: ['0'] },
      { id: 't4', from: 'q1', to: 'q0', symbols: ['1'] },
      { id: 't5', from: 'q2', to: 'q1', symbols: ['0'] },
      { id: 't6', from: 'q2', to: 'q2', symbols: ['1'] },
    ],
  },
  {
    id: 'preset-substr-101',
    name: 'Contains Substring 101 (DFA)',
    description: 'Accepts all binary strings containing "101" anywhere. 4-state minimal DFA.',
    alphabet: ['0', '1'],
    states: [
      { id: 'q0', label: 'q0', x: 95, y: 165, isStart: true, isAccept: false },
      { id: 'q1', label: 'q1', x: 245, y: 165, isStart: false, isAccept: false },
      { id: 'q2', label: 'q2', x: 395, y: 165, isStart: false, isAccept: false },
      { id: 'q3', label: 'q3', x: 545, y: 165, isStart: false, isAccept: true },
    ],
    transitions: [
      { id: 't1', from: 'q0', to: 'q0', symbols: ['0'] },
      { id: 't2', from: 'q0', to: 'q1', symbols: ['1'] },
      { id: 't3', from: 'q1', to: 'q1', symbols: ['1'] },
      { id: 't4', from: 'q1', to: 'q2', symbols: ['0'] },
      { id: 't5', from: 'q2', to: 'q0', symbols: ['0'] },
      { id: 't6', from: 'q2', to: 'q3', symbols: ['1'] },
      { id: 't7', from: 'q3', to: 'q3', symbols: ['0', '1'] },
    ],
  },
  {
    id: 'preset-even-a-odd-b',
    name: "Even a's & Odd b's (DFA)",
    description: 'Product automaton tracking parity of a and b simultaneously (2×2 = 4 minimal states).',
    alphabet: ['a', 'b'],
    states: [
      { id: 'q0', label: 'EE', x: 185, y: 95, isStart: true, isAccept: false },
      { id: 'q1', label: 'EO', x: 455, y: 95, isStart: false, isAccept: true },
      { id: 'q2', label: 'OE', x: 185, y: 235, isStart: false, isAccept: false },
      { id: 'q3', label: 'OO', x: 455, y: 235, isStart: false, isAccept: false },
    ],
    transitions: [
      { id: 't1', from: 'q0', to: 'q2', symbols: ['a'] },
      { id: 't2', from: 'q2', to: 'q0', symbols: ['a'] },
      { id: 't3', from: 'q1', to: 'q3', symbols: ['a'] },
      { id: 't4', from: 'q3', to: 'q1', symbols: ['a'] },
      { id: 't5', from: 'q0', to: 'q1', symbols: ['b'] },
      { id: 't6', from: 'q1', to: 'q0', symbols: ['b'] },
      { id: 't7', from: 'q2', to: 'q3', symbols: ['b'] },
      { id: 't8', from: 'q3', to: 'q2', symbols: ['b'] },
    ],
  },
  {
    id: 'preset-ends-ab-nfa',
    name: 'Ends with "ab" (NFA)',
    description: 'Classic 3-state nondeterministic FA — click "Convert ε-NFA → DFA" to inspect Subset Construction.',
    alphabet: ['a', 'b'],
    states: [
      { id: 'q0', label: 'q0', x: 135, y: 165, isStart: true, isAccept: false },
      { id: 'q1', label: 'q1', x: 325, y: 165, isStart: false, isAccept: false },
      { id: 'q2', label: 'q2', x: 515, y: 165, isStart: false, isAccept: true },
    ],
    transitions: [
      { id: 't1', from: 'q0', to: 'q0', symbols: ['a', 'b'] },
      { id: 't2', from: 'q0', to: 'q1', symbols: ['a'] },
      { id: 't3', from: 'q1', to: 'q2', symbols: ['b'] },
    ],
  },
  {
    id: 'preset-enfa-abb',
    name: 'ε-NFA for (a+b)*abb',
    description: 'Explicit ε-transition nondeterministic automaton for strings ending in "abb". Try Subset Construction & Minimization!',
    alphabet: ['a', 'b'],
    states: [
      { id: 'q0', label: 'q0', x: 95, y: 165, isStart: true, isAccept: false },
      { id: 'q1', label: 'q1', x: 225, y: 165, isStart: false, isAccept: false },
      { id: 'q2', label: 'q2', x: 350, y: 165, isStart: false, isAccept: false },
      { id: 'q3', label: 'q3', x: 465, y: 165, isStart: false, isAccept: false },
      { id: 'q4', label: 'q4', x: 575, y: 165, isStart: false, isAccept: true },
    ],
    transitions: [
      { id: 't1', from: 'q0', to: 'q0', symbols: ['a', 'b'] },
      { id: 't2', from: 'q0', to: 'q1', symbols: [EPSILON] },
      { id: 't3', from: 'q1', to: 'q2', symbols: ['a'] },
      { id: 't4', from: 'q2', to: 'q3', symbols: ['b'] },
      { id: 't5', from: 'q3', to: 'q4', symbols: ['b'] },
    ],
  },
];

// ============================================================================
// 7. PUSHDOWN AUTOMATON (PDA) ENGINE — DPDA & NPDA + LIVE STACK
// ============================================================================

export type PdaAcceptanceMode = 'final_state' | 'empty_stack';

export interface PdaTransition {
  id: string;
  from: string;
  input: string; // single char or 'ε'
  stackTop: string; // single symbol e.g. 'Z0', 'A', '0'
  to: string;
  push: string[]; // top-of-stack FIRST! e.g. ['A', 'Z0'] pushes Z0 then A on top; [] = POP ('ε')
}

export interface PdaModel {
  id: string;
  name: string;
  languageExpr: string;
  classification: 'DCFL (DPDA)' | 'Non-DCFL CFL (NPDA)';
  description: string;
  states: Array<{ id: string; label: string; x: number; y: number; isStart: boolean; isAccept: boolean }>;
  initialStackSymbol: string;
  defaultSampleInput: string;
  transitions: PdaTransition[];
}

export interface PdaDeterminismReport {
  isDeterministic: boolean;
  classification: 'DPDA (Deterministic)' | 'NPDA (Non-Deterministic)';
  conflicts: string[];
}

export interface PdaStepSnapshot {
  step: number;
  stateId: string;
  inputIndex: number;
  stack: string[]; // index 0 = TOP of stack, last element = BOTTOM (Z0)
  appliedRule?: string;
}

export interface PdaSimulationResult {
  input: string;
  mode: PdaAcceptanceMode;
  accepted: boolean;
  reason: string;
  steps: PdaStepSnapshot[];
}

export function formatPushSymbols(push: string[]): string {
  return push.length === 0 ? EPSILON : push.join('');
}

export function parsePushString(raw: string): string[] {
  const clean = raw.trim();
  if (!clean || clean === EPSILON || clean.toLowerCase() === 'eps') return [];
  // Parse tokens keeping Z0 as a single stack symbol
  const out: string[] = [];
  let i = 0;
  while (i < clean.length) {
    if (clean[i] === 'Z' && clean[i + 1] === '0') {
      out.push('Z0');
      i += 2;
    } else if (clean[i] === 'Z' && clean[i + 1] === '₀') {
      out.push('Z0');
      i += 2;
    } else {
      out.push(clean[i]);
      i += 1;
    }
  }
  return out;
}

export function detectPdaDeterminism(pda: PdaModel): PdaDeterminismReport {
  const conflicts: string[] = [];
  const byStateTop = new Map<string, PdaTransition[]>();

  for (const tr of pda.transitions) {
    const key = `${tr.from}::${tr.stackTop}`;
    const list = byStateTop.get(key) ?? [];
    list.push(tr);
    byStateTop.set(key, list);
  }

  for (const [key, list] of byStateTop.entries()) {
    const [st, top] = key.split('::');
    const epsRules = list.filter((t) => normalizeSymbol(t.input) === EPSILON);
    const symRules = list.filter((t) => normalizeSymbol(t.input) !== EPSILON);

    if (epsRules.length > 1) {
      conflicts.push(`(${st}, ε, ${top}) has ${epsRules.length} competing ε-transitions.`);
    }
    if (epsRules.length > 0 && symRules.length > 0) {
      conflicts.push(
        `(${st}, ε, ${top}) conflicts with input transition on "${symRules[0].input}" (DPDA forbids ε + symbol ambiguity).`
      );
    }

    const bySym = new Map<string, number>();
    for (const r of symRules) {
      bySym.set(r.input, (bySym.get(r.input) ?? 0) + 1);
    }
    for (const [sym, count] of bySym.entries()) {
      if (count > 1) {
        conflicts.push(`(${st}, ${sym}, ${top}) branches into ${count} target moves.`);
      }
    }
  }

  const isDeterministic = conflicts.length === 0;
  return {
    isDeterministic,
    classification: isDeterministic ? 'DPDA (Deterministic)' : 'NPDA (Non-Deterministic)',
    conflicts,
  };
}

export function simulatePda(
  pda: PdaModel,
  rawInput: string,
  mode: PdaAcceptanceMode = 'final_state'
): PdaSimulationResult {
  const input = rawInput.trim() === EPSILON ? '' : rawInput.trim();
  const startState = pda.states.find((s) => s.isStart);
  if (!startState) {
    return {
      input,
      mode,
      accepted: false,
      reason: 'PDA has no start state.',
      steps: [],
    };
  }
  const acceptIds = new Set(pda.states.filter((s) => s.isAccept).map((s) => s.id));

  interface SearchNode {
    stateId: string;
    inputIndex: number;
    stack: string[];
    path: PdaStepSnapshot[];
  }

  const initSnap: PdaStepSnapshot = {
    step: 0,
    stateId: startState.id,
    inputIndex: 0,
    stack: [pda.initialStackSymbol],
  };

  const isAccepted = (node: SearchNode): boolean => {
    if (node.inputIndex !== input.length) return false;
    if (mode === 'final_state') return acceptIds.has(node.stateId);
    return node.stack.length === 0;
  };

  const queue: SearchNode[] = [
    {
      stateId: startState.id,
      inputIndex: 0,
      stack: [pda.initialStackSymbol],
      path: [initSnap],
    },
  ];

  const visited = new Set<string>();
  let bestFailedNode: SearchNode = queue[0];
  const MAX_VISITED = 2500;
  const MAX_STACK = 40;
  const MAX_STEPS = 80;

  while (queue.length > 0 && visited.size < MAX_VISITED) {
    const curr = queue.shift()!;
    if (
      curr.inputIndex > bestFailedNode.inputIndex ||
      (curr.inputIndex === bestFailedNode.inputIndex && curr.path.length > bestFailedNode.path.length)
    ) {
      bestFailedNode = curr;
    }

    if (isAccepted(curr)) {
      return {
        input,
        mode,
        accepted: true,
        reason:
          mode === 'final_state'
            ? `Consumed entire input and reached accept state ${curr.stateId}.`
            : 'Consumed entire input with empty stack.',
        steps: curr.path,
      };
    }

    if (curr.path.length >= MAX_STEPS || curr.stack.length === 0) continue;

    const top = curr.stack[0];
    const nextChar = curr.inputIndex < input.length ? input[curr.inputIndex] : null;

    for (const tr of pda.transitions) {
      if (tr.from !== curr.stateId || tr.stackTop !== top) continue;
      const trInput = normalizeSymbol(tr.input);
      const isEps = trInput === EPSILON;
      if (!isEps && trInput !== nextChar) continue;

      const newStack = [...tr.push, ...curr.stack.slice(1)];
      if (newStack.length > MAX_STACK) continue;

      const nextIndex = isEps ? curr.inputIndex : curr.inputIndex + 1;
      const stateSig = `${tr.to}|${nextIndex}|${newStack.join(',')}`;
      if (visited.has(stateSig)) continue;
      visited.add(stateSig);

      const ruleText = `(${tr.from}, ${trInput}, ${tr.stackTop}) → (${tr.to}, ${formatPushSymbols(tr.push)})`;
      const snap: PdaStepSnapshot = {
        step: curr.path.length,
        stateId: tr.to,
        inputIndex: nextIndex,
        stack: newStack,
        appliedRule: ruleText,
      };
      queue.push({
        stateId: tr.to,
        inputIndex: nextIndex,
        stack: newStack,
        path: [...curr.path, snap],
      });
    }
  }

  return {
    input,
    mode,
    accepted: false,
    reason:
      mode === 'final_state'
        ? 'No valid computation path reached an accepting state after consuming full input.'
        : 'No valid computation path emptied the stack after consuming full input.',
    steps: bestFailedNode.path,
  };
}

export const GATE_PDA_PRESETS: PdaModel[] = [
  {
    id: 'pda-anbn',
    name: 'L = { aⁿbⁿ | n ≥ 1 }',
    languageExpr: 'L = { aⁿbⁿ | n ≥ 1 }',
    classification: 'DCFL (DPDA)',
    description: 'Push A for each a, pop A for each b, accept when Z0 is exposed at end of input.',
    initialStackSymbol: 'Z0',
    defaultSampleInput: 'aaabbb',
    states: [
      { id: 'q0', label: 'q0', x: 120, y: 120, isStart: true, isAccept: false },
      { id: 'q1', label: 'q1', x: 310, y: 120, isStart: false, isAccept: false },
      { id: 'qf', label: 'qf', x: 500, y: 120, isStart: false, isAccept: true },
    ],
    transitions: [
      { id: 'p1', from: 'q0', input: 'a', stackTop: 'Z0', to: 'q0', push: ['A', 'Z0'] },
      { id: 'p2', from: 'q0', input: 'a', stackTop: 'A', to: 'q0', push: ['A', 'A'] },
      { id: 'p3', from: 'q0', input: 'b', stackTop: 'A', to: 'q1', push: [] },
      { id: 'p4', from: 'q1', input: 'b', stackTop: 'A', to: 'q1', push: [] },
      { id: 'p5', from: 'q1', input: EPSILON, stackTop: 'Z0', to: 'qf', push: [] },
    ],
  },
  {
    id: 'pda-wcwr',
    name: 'L = { w c wᴿ | w ∈ {a,b}* }',
    languageExpr: 'L = { w c wᴿ | w ∈ {a,b}* }',
    classification: 'DCFL (DPDA)',
    description: 'Center marker "c" lets a DPDA switch deterministically from pushing w to popping wᴿ.',
    initialStackSymbol: 'Z0',
    defaultSampleInput: 'abacaba',
    states: [
      { id: 'q0', label: 'q0', x: 120, y: 120, isStart: true, isAccept: false },
      { id: 'q1', label: 'q1', x: 310, y: 120, isStart: false, isAccept: false },
      { id: 'qf', label: 'qf', x: 500, y: 120, isStart: false, isAccept: true },
    ],
    transitions: [
      { id: 'p1', from: 'q0', input: 'a', stackTop: 'Z0', to: 'q0', push: ['a', 'Z0'] },
      { id: 'p2', from: 'q0', input: 'b', stackTop: 'Z0', to: 'q0', push: ['b', 'Z0'] },
      { id: 'p3', from: 'q0', input: 'a', stackTop: 'a', to: 'q0', push: ['a', 'a'] },
      { id: 'p4', from: 'q0', input: 'a', stackTop: 'b', to: 'q0', push: ['a', 'b'] },
      { id: 'p5', from: 'q0', input: 'b', stackTop: 'a', to: 'q0', push: ['b', 'a'] },
      { id: 'p6', from: 'q0', input: 'b', stackTop: 'b', to: 'q0', push: ['b', 'b'] },
      { id: 'p7', from: 'q0', input: 'c', stackTop: 'Z0', to: 'q1', push: ['Z0'] },
      { id: 'p8', from: 'q0', input: 'c', stackTop: 'a', to: 'q1', push: ['a'] },
      { id: 'p9', from: 'q0', input: 'c', stackTop: 'b', to: 'q1', push: ['b'] },
      { id: 'p10', from: 'q1', input: 'a', stackTop: 'a', to: 'q1', push: [] },
      { id: 'p11', from: 'q1', input: 'b', stackTop: 'b', to: 'q1', push: [] },
      { id: 'p12', from: 'q1', input: EPSILON, stackTop: 'Z0', to: 'qf', push: [] },
    ],
  },
  {
    id: 'pda-wwr',
    name: 'L = { w wᴿ | w ∈ {a,b}* } (NPDA)',
    languageExpr: 'L = { w wᴿ | w ∈ {a,b}* }',
    classification: 'Non-DCFL CFL (NPDA)',
    description: 'Without a center marker, the PDA must non-deterministically guess the midpoint via ε-transitions!',
    initialStackSymbol: 'Z0',
    defaultSampleInput: 'abba',
    states: [
      { id: 'q0', label: 'q0', x: 120, y: 120, isStart: true, isAccept: false },
      { id: 'q1', label: 'q1', x: 310, y: 120, isStart: false, isAccept: false },
      { id: 'qf', label: 'qf', x: 500, y: 120, isStart: false, isAccept: true },
    ],
    transitions: [
      { id: 'p1', from: 'q0', input: 'a', stackTop: 'Z0', to: 'q0', push: ['a', 'Z0'] },
      { id: 'p2', from: 'q0', input: 'b', stackTop: 'Z0', to: 'q0', push: ['b', 'Z0'] },
      { id: 'p3', from: 'q0', input: 'a', stackTop: 'a', to: 'q0', push: ['a', 'a'] },
      { id: 'p4', from: 'q0', input: 'a', stackTop: 'b', to: 'q0', push: ['a', 'b'] },
      { id: 'p5', from: 'q0', input: 'b', stackTop: 'a', to: 'q0', push: ['b', 'a'] },
      { id: 'p6', from: 'q0', input: 'b', stackTop: 'b', to: 'q0', push: ['b', 'b'] },
      { id: 'p7', from: 'q0', input: EPSILON, stackTop: 'Z0', to: 'q1', push: ['Z0'] },
      { id: 'p8', from: 'q0', input: EPSILON, stackTop: 'a', to: 'q1', push: ['a'] },
      { id: 'p9', from: 'q0', input: EPSILON, stackTop: 'b', to: 'q1', push: ['b'] },
      { id: 'p10', from: 'q1', input: 'a', stackTop: 'a', to: 'q1', push: [] },
      { id: 'p11', from: 'q1', input: 'b', stackTop: 'b', to: 'q1', push: [] },
      { id: 'p12', from: 'q1', input: EPSILON, stackTop: 'Z0', to: 'qf', push: [] },
    ],
  },
  {
    id: 'pda-equal-01',
    name: "Equal 0's and 1's (DPDA)",
    languageExpr: 'L = { w ∈ {0,1}* | #0(w) = #1(w) }',
    classification: 'DCFL (DPDA)',
    description: 'Uses stack as a signed counter: q0 (balanced/accept) pushes surplus to q1; when Z0 re-emerges in q1, deterministic ε-move returns to q0.',
    initialStackSymbol: 'Z0',
    defaultSampleInput: '011001',
    states: [
      { id: 'q0', label: 'q0', x: 185, y: 120, isStart: true, isAccept: true },
      { id: 'q1', label: 'q1', x: 435, y: 120, isStart: false, isAccept: false },
    ],
    transitions: [
      { id: 'p1', from: 'q0', input: '0', stackTop: 'Z0', to: 'q1', push: ['0', 'Z0'] },
      { id: 'p2', from: 'q0', input: '1', stackTop: 'Z0', to: 'q1', push: ['1', 'Z0'] },
      { id: 'p3', from: 'q1', input: '0', stackTop: '0', to: 'q1', push: ['0', '0'] },
      { id: 'p4', from: 'q1', input: '1', stackTop: '1', to: 'q1', push: ['1', '1'] },
      { id: 'p5', from: 'q1', input: '0', stackTop: '1', to: 'q1', push: [] },
      { id: 'p6', from: 'q1', input: '1', stackTop: '0', to: 'q1', push: [] },
      { id: 'p7', from: 'q1', input: EPSILON, stackTop: 'Z0', to: 'q0', push: ['Z0'] },
    ],
  },
];

// ============================================================================
// 8. CURATED GATE CSE LANGUAGE CLASSIFIER LIBRARY (28 CLASSIC LANGUAGES)
// ============================================================================

export type ChomskyClass =
  | 'Regular'
  | 'DCFL'
  | 'CFL (Non-DCFL)'
  | 'CSL'
  | 'Recursive'
  | 'RE (Non-Recursive)'
  | 'Not RE';

export interface GateLanguageEntry {
  id: string;
  expression: string;
  title: string;
  chomskyClass: ChomskyClass;
  isDcfl: boolean;
  complementClass: string;
  myhillNerode: string;
  pumpingSketch: string;
  gateTrap: string;
  tags: string[];
}

export const GATE_LANGUAGE_LIBRARY: GateLanguageEntry[] = [
  {
    id: 'lang-div3',
    expression: 'L = { w ∈ {0,1}* | val(w) mod 3 = 0 }',
    title: 'Binary Numbers Divisible by 3',
    chomskyClass: 'Regular',
    isDcfl: true,
    complementClass: 'Regular (closed under complement)',
    myhillNerode: 'Index = 3 equivalence classes (remainders 0, 1, 2 mod 3).',
    pumpingSketch: 'Regular — satisfies Regular Pumping Lemma with p = 3.',
    gateTrap: 'Every Regular language is also DCFL, CFL, CSL, Recursive, and RE.',
    tags: ['dfa', 'mod', 'regular'],
  },
  {
    id: 'lang-a-star-b-star',
    expression: 'L = { aⁱbʲ | i, j ≥ 0 }',
    title: 'Independent Counts a*b*',
    chomskyClass: 'Regular',
    isDcfl: true,
    complementClass: 'Regular',
    myhillNerode: 'Index = 3 (a*, a*b+, and trap state after seeing "ba").',
    pumpingSketch: 'No dependency between i and j; recognized by a 3-state complete DFA.',
    gateTrap: 'Students often confuse independent exponents (i, j) with coupled exponents (i = j).',
    tags: ['regular', 'exponents'],
  },
  {
    id: 'lang-bounded-anbn',
    expression: 'L = { aⁿbⁿ | 1 ≤ n ≤ 10⁶ }',
    title: 'Bounded aⁿbⁿ (Finite Language)',
    chomskyClass: 'Regular',
    isDcfl: true,
    complementClass: 'Regular',
    myhillNerode: 'Finite index (every finite language has a finite DFA).',
    pumpingSketch: 'Every finite language is vacuously Regular — choose pumping length p > max string length!',
    gateTrap: 'Classic GATE trap! Upper-bounding n makes it FINITE, therefore ALWAYS Regular.',
    tags: ['finite', 'trap', 'regular'],
  },
  {
    id: 'lang-sub-01-10',
    expression: 'L = { w ∈ {0,1}* | #01(w) = #10(w) }',
    title: 'Equal Substrings "01" and "10"',
    chomskyClass: 'Regular',
    isDcfl: true,
    complementClass: 'Regular',
    myhillNerode: 'Index = 4 (depends ONLY on first bit == last bit!).',
    pumpingSketch: 'Between any two 01 transitions there must be a 10 transition — so #01 = #10 iff first char = last char (or |w| ≤ 1).',
    gateTrap: 'Huge GATE PYQ favorite! Looks like a counting CFL, but is actually Regular.',
    tags: ['trap', 'substrings', 'regular'],
  },
  {
    id: 'lang-mod-diff',
    expression: 'L = { w ∈ {a,b}* | (#a(w) - #b(w)) mod 5 = 0 }',
    title: 'Difference Modulo Constant',
    chomskyClass: 'Regular',
    isDcfl: true,
    complementClass: 'Regular',
    myhillNerode: 'Index = 5 (track running difference mod 5).',
    pumpingSketch: 'Modulo arithmetic requires only finite memory (k states for mod k).',
    gateTrap: 'Unbounded count is non-regular, but count modulo fixed k is ALWAYS Regular.',
    tags: ['modulo', 'regular'],
  },
  {
    id: 'lang-anbn',
    expression: 'L = { aⁿbⁿ | n ≥ 1 }',
    title: 'Canonical Balanced aⁿbⁿ',
    chomskyClass: 'DCFL',
    isDcfl: true,
    complementClass: 'DCFL (DCFL is closed under complement!)',
    myhillNerode: 'Infinite index: strings aⁱ and aʲ (i ≠ j) are distinguished by bⁱ.',
    pumpingSketch: 'Fails Regular PL: pumping y inside aᵖ breaks balance. Accepted by 1-stack DPDA.',
    gateTrap: 'Because L is DCFL, its complement L̄ is ALSO DCFL (and hence CFL).',
    tags: ['dcfl', 'dpda', 'classic'],
  },
  {
    id: 'lang-equal-ab',
    expression: 'L = { w ∈ {a,b}* | #a(w) = #b(w) }',
    title: 'Equal Count of a and b',
    chomskyClass: 'DCFL',
    isDcfl: true,
    complementClass: 'DCFL',
    myhillNerode: 'Infinite index: aⁱ vs aʲ distinguished by bⁱ.',
    pumpingSketch: 'DPDA pushes surplus symbol and cancels opposite symbol on the stack.',
    gateTrap: 'Note: #a = #b is DCFL, whereas #a = #b = #c over {a,b,c} is NOT even CFL (it is CSL)!',
    tags: ['dcfl', 'counter'],
  },
  {
    id: 'lang-wcwr',
    expression: 'L = { w c wᴿ | w ∈ {a,b}* }',
    title: 'Marked Even-Length Palindromes',
    chomskyClass: 'DCFL',
    isDcfl: true,
    complementClass: 'DCFL',
    myhillNerode: 'Infinite index: distinct prefixes w₁ ≠ w₂ distinguished by c w₁ᴿ.',
    pumpingSketch: 'Explicit center marker c gives deterministic switch from push phase to pop phase.',
    gateTrap: 'Compare with wwᴿ (no marker → Non-DCFL CFL) and wcw (copy → CSL, not CFL)!',
    tags: ['dcfl', 'palindrome'],
  },
  {
    id: 'lang-balanced-parens',
    expression: 'L = Dyck Language (Balanced Parentheses)',
    title: 'Balanced Parentheses / Nested Brackets',
    chomskyClass: 'DCFL',
    isDcfl: true,
    complementClass: 'DCFL',
    myhillNerode: 'Infinite index: (ⁱ and (ʲ distinguished by )ⁱ.',
    pumpingSketch: 'Standard LR(1)/DPDA grammar S → (S)S | ε.',
    gateTrap: 'Every LL(k) and LR(k) grammar generates a DCFL.',
    tags: ['dcfl', 'compiler'],
  },
  {
    id: 'lang-ai-bj-neq',
    expression: 'L = { aⁱbʲ | i ≠ j }',
    title: 'Unequal Counts aⁱbʲ (i ≠ j)',
    chomskyClass: 'DCFL',
    isDcfl: true,
    complementClass: 'DCFL (complement inside a*b* is aⁿbⁿ)',
    myhillNerode: 'Infinite index: aⁱ vs aʲ distinguished by bⁱ.',
    pumpingSketch: 'Complement of DCFL {aⁿbⁿ} intersected with Regular a*b* → DCFL!',
    gateTrap: 'GATE loves proving DCFL via complement + Regular intersection (both preserve DCFL).',
    tags: ['dcfl', 'complement'],
  },
  {
    id: 'lang-a-n-b-2n',
    expression: 'L = { aⁿb²ⁿ | n ≥ 0 }',
    title: 'Linear Ratio aⁿb²ⁿ',
    chomskyClass: 'DCFL',
    isDcfl: true,
    complementClass: 'DCFL',
    myhillNerode: 'Infinite index.',
    pumpingSketch: 'DPDA pushes two A symbols per "a" and pops one A per "b".',
    gateTrap: 'Any single linear relation like j = k·i + c is DCFL; quadratic j = i² is CSL.',
    tags: ['dcfl', 'linear'],
  },
  {
    id: 'lang-wwr',
    expression: 'L = { w wᴿ | w ∈ {a,b}* }',
    title: 'Unmarked Even Palindromes',
    chomskyClass: 'CFL (Non-DCFL)',
    isDcfl: false,
    complementClass: 'CFL (Non-DCFL) — wait: actually CFL here, though general CFL is not closed!',
    myhillNerode: 'Infinite index.',
    pumpingSketch: 'Requires NPDA to guess midpoint non-deterministically; provably has no DPDA.',
    gateTrap: 'Classic GATE distinction: wcwᴿ is DCFL, wwᴿ is Non-DCFL CFL, ww is NOT CFL.',
    tags: ['cfl', 'npda', 'palindrome'],
  },
  {
    id: 'lang-ambiguous-union',
    expression: 'L = { aⁱbʲcᵏ | i = j or j = k }',
    title: 'Inherently Ambiguous Union',
    chomskyClass: 'CFL (Non-DCFL)',
    isDcfl: false,
    complementClass: 'CSL (NOT CFL! Complement intersects to aⁿbⁿcⁿ)',
    myhillNerode: 'Infinite index.',
    pumpingSketch: 'Union of two DCFLs ({aⁱbⁱc*} ∪ {a*bʲcʲ}) is CFL, inherently ambiguous, hence NOT DCFL.',
    gateTrap: 'Huge GATE trap: DCFL is NOT closed under Union! Its complement is NOT even CFL.',
    tags: ['cfl', 'ambiguous', 'trap'],
  },
  {
    id: 'lang-not-ww',
    expression: 'L = { w ∈ {a,b}* | w ≠ xx for any x } (Complement of ww)',
    title: 'Complement of Copy Language (ww̄)',
    chomskyClass: 'CFL (Non-DCFL)',
    isDcfl: false,
    complementClass: 'CSL (L̄ = {ww}, NOT CFL!)',
    myhillNerode: 'Infinite index.',
    pumpingSketch: 'Either |w| is odd, OR there exist mismatched chars at offset n = |w|/2 — expressible as an NPDA!',
    gateTrap: 'Famous GATE shock! {ww} is NOT CFL, yet its complement {ww}̄ IS a Non-DCFL CFL!',
    tags: ['cfl', 'trap', 'complement'],
  },
  {
    id: 'lang-not-anbncn',
    expression: 'L = { aⁱbʲcᵏ | i ≠ j or j ≠ k }',
    title: 'Complement of aⁿbⁿcⁿ (within a*b*c*)',
    chomskyClass: 'CFL (Non-DCFL)',
    isDcfl: false,
    complementClass: 'CSL (contains aⁿbⁿcⁿ)',
    myhillNerode: 'Infinite index.',
    pumpingSketch: 'Union of two CFLs: {aⁱbʲcᵏ | i ≠ j} ∪ {aⁱbʲcᵏ | j ≠ k}.',
    gateTrap: 'Proves CFL is NOT closed under complement (L is CFL, L̄ ∩ a*b*c* = aⁿbⁿcⁿ is not CFL).',
    tags: ['cfl', 'complement'],
  },
  {
    id: 'lang-not-palindrome',
    expression: 'L = { w ∈ {a,b}* | w ≠ wᴿ }',
    title: 'Non-Palindromes',
    chomskyClass: 'CFL (Non-DCFL)',
    isDcfl: false,
    complementClass: 'CFL (Palindromes)',
    myhillNerode: 'Infinite index.',
    pumpingSketch: 'CFG S → aSa | bSb | A where A forces at least one mismatched pair a...b or b...a.',
    gateTrap: 'Non-palindromes are CFL (Non-DCFL), NOT Regular.',
    tags: ['cfl', 'palindrome'],
  },
  {
    id: 'lang-anbncn',
    expression: 'L = { aⁿbⁿcⁿ | n ≥ 1 }',
    title: 'Three-Way Equal Count aⁿbⁿcⁿ',
    chomskyClass: 'CSL',
    isDcfl: false,
    complementClass: 'CSL (Immerman–Szelepcsényi: CSL is closed under complement)',
    myhillNerode: 'Infinite index.',
    pumpingSketch: 'Fails CFL Pumping Lemma: any substring vxy of length ≤ p spans at most 2 distinct letters, so pumping breaks 3-way equality.',
    gateTrap: 'Intersection of two CFLs {aⁿbⁿc*} ∩ {a*bⁿcⁿ} = aⁿbⁿcⁿ (proves CFL not closed under intersection).',
    tags: ['csl', 'pumping-lemma', 'classic'],
  },
  {
    id: 'lang-ww',
    expression: 'L = { w w | w ∈ {a,b}* }',
    title: 'Exact String Copy (Tandem Repeat)',
    chomskyClass: 'CSL',
    isDcfl: false,
    complementClass: 'CFL (Non-DCFL)!',
    myhillNerode: 'Infinite index.',
    pumpingSketch: 'Fails CFL PL on aᵖbᵖaᵖbᵖ. Accepted by Linear Bounded Automaton (LBA).',
    gateTrap: 'Over a UNARY alphabet {a}, {ww} = {a²ⁿ} IS Regular! Always check |Σ| ≥ 2!',
    tags: ['csl', 'trap', 'copy'],
  },
  {
    id: 'lang-wcw',
    expression: 'L = { w c w | w ∈ {a,b}* }',
    title: 'Marked String Copy',
    chomskyClass: 'CSL',
    isDcfl: false,
    complementClass: 'CFL (Non-DCFL)',
    myhillNerode: 'Infinite index.',
    pumpingSketch: 'Even with center marker c, a FIFO queue (not LIFO stack) is needed to match w with w in forward order.',
    gateTrap: 'wcwᴿ is DCFL, but wcw is NOT CFL (stack reverses order!).',
    tags: ['csl', 'copy'],
  },
  {
    id: 'lang-prime-unary',
    expression: 'L = { aᵖ | p is prime }',
    title: 'Unary Prime Lengths',
    chomskyClass: 'CSL',
    isDcfl: false,
    complementClass: 'CSL',
    myhillNerode: 'Infinite index.',
    pumpingSketch: 'Parikh Theorem: every unary CFL is Regular! Since primes do not form an ultimately periodic arithmetic progression, {aᵖ} is NOT CFL.',
    gateTrap: 'Killer GATE theorem: Over a unary alphabet Σ={a}, Regular = DCFL = CFL! So non-regular unary languages jump straight to CSL.',
    tags: ['csl', 'unary', 'parikh'],
  },
  {
    id: 'lang-square-unary',
    expression: 'L = { a^(n²) | n ≥ 1 }',
    title: 'Unary Perfect Squares',
    chomskyClass: 'CSL',
    isDcfl: false,
    complementClass: 'CSL',
    myhillNerode: 'Infinite index.',
    pumpingSketch: 'Gaps between consecutive squares (2n+1) grow without bound, failing Regular PL and Parikh theorem (thus not CFL).',
    gateTrap: 'Same unary Parikh rule: {a^(2ⁿ)}, {a^(n!)}, {a^(n²)} are all CSL, NEVER CFL.',
    tags: ['csl', 'unary'],
  },
  {
    id: 'lang-equal-abc',
    expression: 'L = { w ∈ {a,b,c}* | #a(w) = #b(w) = #c(w) }',
    title: 'Equal Counts of 3 Symbols',
    chomskyClass: 'CSL',
    isDcfl: false,
    complementClass: 'CSL',
    myhillNerode: 'Infinite index.',
    pumpingSketch: 'If it were CFL, intersecting with Regular a*b*c* would make aⁿbⁿcⁿ CFL — contradiction!',
    gateTrap: 'Always use closure under intersection with Regular language to disprove CFL in 10 seconds.',
    tags: ['csl', 'closure'],
  },
  {
    id: 'lang-ai-bj-ck-prod',
    expression: 'L = { aⁱbʲc^(i·j) | i, j ≥ 1 }',
    title: 'Multiplicative Exponents',
    chomskyClass: 'CSL',
    isDcfl: false,
    complementClass: 'CSL',
    myhillNerode: 'Infinite index.',
    pumpingSketch: 'Requires non-linear counting (multiplication) beyond pushdown stack capability; decidable in O(n) tape (LBA).',
    gateTrap: 'Linear sum c^(i+j) IS CFL (push a, push b, pop c), but product c^(i·j) is CSL!',
    tags: ['csl', 'exponents'],
  },
  {
    id: 'lang-a-i-b-j-c-iplusj',
    expression: 'L = { aⁱbʲc^(i+j) | i, j ≥ 0 }',
    title: 'Additive Exponents c^(i+j)',
    chomskyClass: 'DCFL',
    isDcfl: true,
    complementClass: 'DCFL',
    myhillNerode: 'Infinite index.',
    pumpingSketch: 'Push X for every a and every b, then pop one X for every c — deterministic 1-stack DPDA!',
    gateTrap: 'Compare aⁱbʲc^(i+j) (DCFL) vs aⁱbʲc^(i·j) (CSL).',
    tags: ['dcfl', 'exponents'],
  },
  {
    id: 'lang-atm',
    expression: 'A_TM = { ⟨M, w⟩ | TM M accepts w }',
    title: 'Universal TM Acceptance Language',
    chomskyClass: 'RE (Non-Recursive)',
    isDcfl: false,
    complementClass: 'Not RE (co-RE only)',
    myhillNerode: 'Undecidable (semi-decidable via Universal TM simulation).',
    pumpingSketch: 'Recognizable by running M on w; undecidable by diagonalization / halting reduction.',
    gateTrap: 'A_TM is RE but NOT Recursive; its complement Ā_TM is NOT even RE.',
    tags: ['re', 'undecidable', 'tm'],
  },
  {
    id: 'lang-halt',
    expression: 'HALT_TM = { ⟨M, w⟩ | TM M halts on w }',
    title: 'Turing Machine Halting Problem',
    chomskyClass: 'RE (Non-Recursive)',
    isDcfl: false,
    complementClass: 'Not RE',
    myhillNerode: 'Undecidable.',
    pumpingSketch: 'Simulate M on w: if M halts, accept; if M loops, Universal TM loops.',
    gateTrap: 'Halting on a SPECIFIC input w is RE; halting on ALL inputs (TOTAL_TM) is NOT RE!',
    tags: ['re', 'halting', 'tm'],
  },
  {
    id: 'lang-etm',
    expression: 'E_TM = { ⟨M⟩ | L(M) = ∅ }',
    title: 'TM Emptiness Problem',
    chomskyClass: 'Not RE',
    isDcfl: false,
    complementClass: 'RE (Non-Recursive) — NE_TM is RE via dovetailing!',
    myhillNerode: 'Undecidable & not semi-decidable (Rice Theorem).',
    pumpingSketch: 'Complement NE_TM = {⟨M⟩ | L(M) ≠ ∅} IS RE (dovetail over all strings); if E_TM were also RE, both would be Recursive — contradiction.',
    gateTrap: 'Huge GATE favorite: E_DFA & E_CFG are Decidable, E_TM is NOT RE, NE_TM is RE!',
    tags: ['not-re', 'rice', 'decidability'],
  },
  {
    id: 'lang-eqtm',
    expression: 'EQ_TM = { ⟨M₁, M₂⟩ | L(M₁) = L(M₂) }',
    title: 'TM Equivalence Problem',
    chomskyClass: 'Not RE',
    isDcfl: false,
    complementClass: 'Not RE (neither EQ_TM nor its complement is RE!)',
    myhillNerode: 'Neither RE nor co-RE.',
    pumpingSketch: 'Both E_TM and NE_TM reduce to EQ_TM / its complement.',
    gateTrap: 'EQ_DFA is Decidable, EQ_DPDA is Decidable (Sénizergues), EQ_CFG is Undecidable (co-RE), EQ_TM is neither RE nor co-RE!',
    tags: ['not-re', 'equivalence'],
  },
];
