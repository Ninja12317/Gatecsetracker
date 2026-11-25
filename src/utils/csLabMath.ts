export type TocLanguageId = 'regular' | 'dcfl' | 'cfl' | 'csl' | 'recursive' | 're';

export interface TocLanguageCol {
  id: TocLanguageId;
  shortLabel: string;
  fullLabel: string;
  machine: string;
}

export interface TocMatrixRow {
  id: string;
  label: string;
  category: 'closure' | 'decidability';
  values: Record<TocLanguageId, boolean>;
  gateNote: string;
}

export const TOC_LANGUAGES: TocLanguageCol[] = [
  { id: 'regular', shortLabel: 'Regular', fullLabel: 'Regular (Type-3)', machine: 'DFA / NFA' },
  { id: 'dcfl', shortLabel: 'DCFL', fullLabel: 'Deterministic CFL', machine: 'DPDA' },
  { id: 'cfl', shortLabel: 'CFL', fullLabel: 'Context-Free (Type-2)', machine: 'NPDA' },
  { id: 'csl', shortLabel: 'CSL', fullLabel: 'Context-Sensitive (Type-1)', machine: 'LBA' },
  { id: 'recursive', shortLabel: 'Recursive', fullLabel: 'Recursive (Decidable)', machine: 'Halting TM' },
  { id: 're', shortLabel: 'RE', fullLabel: 'Recursively Enumerable (Type-0)', machine: 'TM' },
];

export const TOC_CLOSURE_ROWS: TocMatrixRow[] = [
  {
    id: 'union',
    label: 'Union (L1 ∪ L2)',
    category: 'closure',
    values: { regular: true, dcfl: false, cfl: true, csl: true, recursive: true, re: true },
    gateNote: 'DCFL is NOT closed under union (e.g. a^n b^n c^m ∪ a^m b^n c^n).',
  },
  {
    id: 'intersection',
    label: 'Intersection (L1 ∩ L2)',
    category: 'closure',
    values: { regular: true, dcfl: false, cfl: false, csl: true, recursive: true, re: true },
    gateNote: 'Neither DCFL nor CFL is closed under intersection (a^n b^n c^n counterexample).',
  },
  {
    id: 'complement',
    label: 'Complement (L̄)',
    category: 'closure',
    values: { regular: true, dcfl: true, cfl: false, csl: true, recursive: true, re: false },
    gateNote: 'DCFL is closed under complement; CSL is closed by Immerman–Szelepcsényi; RE is NOT.',
  },
  {
    id: 'concatenation',
    label: 'Concatenation (L1 · L2)',
    category: 'closure',
    values: { regular: true, dcfl: false, cfl: true, csl: true, recursive: true, re: true },
    gateNote: 'DCFL is NOT closed under concatenation because the split point is nondeterministic.',
  },
  {
    id: 'kleene_star',
    label: 'Kleene Star (L*)',
    category: 'closure',
    values: { regular: true, dcfl: false, cfl: true, csl: true, recursive: true, re: true },
    gateNote: 'DCFL is NOT closed under Kleene star; all other Chomsky classes above are closed.',
  },
  {
    id: 'homomorphism',
    label: 'Homomorphism h(L)',
    category: 'closure',
    values: { regular: true, dcfl: false, cfl: true, csl: false, recursive: false, re: true },
    gateNote: 'Arbitrary (erasing) homomorphism is NOT closed for DCFL, CSL, or Recursive languages.',
  },
  {
    id: 'inv_homomorphism',
    label: 'Inverse Homomorphism h⁻¹(L)',
    category: 'closure',
    values: { regular: true, dcfl: true, cfl: true, csl: true, recursive: true, re: true },
    gateNote: 'GATE Shortcut: ALL 6 language families are closed under inverse homomorphism!',
  },
  {
    id: 'intersect_regular',
    label: 'Intersection with Regular (L ∩ R)',
    category: 'closure',
    values: { regular: true, dcfl: true, cfl: true, csl: true, recursive: true, re: true },
    gateNote: 'GATE Shortcut: Product construction with DFA keeps ALL 6 classes closed!',
  },
];

export const TOC_DECIDABILITY_ROWS: TocMatrixRow[] = [
  {
    id: 'membership',
    label: 'Membership (w ∈ L?)',
    category: 'decidability',
    values: { regular: true, dcfl: true, cfl: true, csl: true, recursive: true, re: false },
    gateNote: 'Decidable up to Recursive (CYK for CFL, LBA for CSL). RE is only semi-decidable.',
  },
  {
    id: 'emptiness',
    label: 'Emptiness (L = ∅?)',
    category: 'decidability',
    values: { regular: true, dcfl: true, cfl: true, csl: false, recursive: false, re: false },
    gateNote: 'Decidable for Regular, DCFL, and CFL (reachability/generating symbols); Undecidable for CSL+.',
  },
  {
    id: 'finiteness',
    label: 'Finiteness (|L| < ∞?)',
    category: 'decidability',
    values: { regular: true, dcfl: true, cfl: true, csl: false, recursive: false, re: false },
    gateNote: 'Cycle detection decides finiteness for Regular, DCFL, and CFL; Undecidable for CSL+.',
  },
  {
    id: 'equivalence',
    label: 'Equivalence (L1 = L2?)',
    category: 'decidability',
    values: { regular: true, dcfl: true, cfl: false, csl: false, recursive: false, re: false },
    gateNote: 'Regular (DFA minimization) & DCFL (Sénizergues theorem) are Decidable; CFL is Undecidable!',
  },
  {
    id: 'ambiguity',
    label: 'Ambiguity (Grammar / Automaton)',
    category: 'decidability',
    values: { regular: true, dcfl: true, cfl: false, csl: false, recursive: false, re: false },
    gateNote: 'Checking ambiguity of arbitrary CFGs is Undecidable; DFAs/DPDAs are deterministic.',
  },
  {
    id: 'halting',
    label: 'Halting Problem (M halts on w?)',
    category: 'decidability',
    values: { regular: true, dcfl: true, cfl: true, csl: true, recursive: true, re: false },
    gateNote: 'DFA/DPDA/LBA/Decider TM halting is Decidable; general TM (RE) halting is Undecidable.',
  },
];

export function makeTocCellKey(rowId: string, lang: TocLanguageId): string {
  return `${rowId}::${lang}`;
}

export function pickQuizCells(
  rows: TocMatrixRow[],
  count = 10,
  fullTable = false,
  seed?: number
): string[] {
  const allKeys: string[] = [];
  for (const row of rows) {
    for (const lang of TOC_LANGUAGES) {
      allKeys.push(makeTocCellKey(row.id, lang.id));
    }
  }
  if (fullTable || count >= allKeys.length) {
    return allKeys;
  }
  // Deterministic or Math.random Fisher-Yates shuffle
  const copy = [...allKeys];
  let s = typeof seed === 'number' ? seed : Math.floor(Math.random() * 1_000_000);
  const nextRand = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(nextRand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.max(1, count));
}

// ===================== 2. COA CACHE & VIRTUAL MEMORY MATH =====================

export type CacheAssociativityMode = 'direct' | 'set_associative' | 'fully_associative';

export interface CacheConfigInput {
  physicalMemoryBytes: number;
  cacheSizeBytes: number;
  blockSizeBytes: number;
  associativityMode: CacheAssociativityMode;
  kWay: number;
  writePolicy?: 'write_through' | 'write_back';
}

export interface CacheBitSplitResult {
  valid: boolean;
  error?: string;
  addressBits: number;
  tagBits: number;
  indexBits: number;
  offsetBits: number;
  numCacheBlocks: number;
  ways: number;
  numSets: number;
  metaBitsPerBlock: number;
  tagDirectoryBits: number;
  tagDirectoryBytes: number;
  tagDirectoryKB: number;
  totalSramKB: number;
}

export function isPowerOfTwo(n: number): boolean {
  return Number.isFinite(n) && n >= 1 && Math.floor(n) === n && (n & (n - 1)) === 0;
}

export function exactLog2(n: number): number {
  if (!Number.isFinite(n) || n < 1) return 0;
  return Math.round(Math.log2(n));
}

export function computeCacheBitSplit(input: CacheConfigInput): CacheBitSplitResult {
  const {
    physicalMemoryBytes,
    cacheSizeBytes,
    blockSizeBytes,
    associativityMode,
    kWay,
    writePolicy = 'write_back',
  } = input;

  const empty: CacheBitSplitResult = {
    valid: false,
    addressBits: 0,
    tagBits: 0,
    indexBits: 0,
    offsetBits: 0,
    numCacheBlocks: 0,
    ways: 1,
    numSets: 0,
    metaBitsPerBlock: 1,
    tagDirectoryBits: 0,
    tagDirectoryBytes: 0,
    tagDirectoryKB: 0,
    totalSramKB: 0,
  };

  if (physicalMemoryBytes <= 0 || cacheSizeBytes <= 0 || blockSizeBytes <= 0) {
    return { ...empty, error: 'All sizes must be positive powers of 2.' };
  }
  if (blockSizeBytes > cacheSizeBytes) {
    return { ...empty, error: 'Block size cannot exceed total Cache size.' };
  }
  if (cacheSizeBytes > physicalMemoryBytes) {
    return { ...empty, error: 'Cache size cannot exceed Physical Address Space.' };
  }

  const addressBits = Math.ceil(Math.log2(physicalMemoryBytes));
  const offsetBits = Math.ceil(Math.log2(blockSizeBytes));
  const numCacheBlocks = Math.floor(cacheSizeBytes / blockSizeBytes);

  let ways = 1;
  if (associativityMode === 'direct') {
    ways = 1;
  } else if (associativityMode === 'fully_associative') {
    ways = numCacheBlocks;
  } else {
    ways = Math.max(1, Math.floor(kWay));
    if (ways > numCacheBlocks) {
      return {
        ...empty,
        error: `k-way (${ways}) cannot exceed total cache lines (${numCacheBlocks}).`,
      };
    }
    if (numCacheBlocks % ways !== 0) {
      return {
        ...empty,
        error: `Cache lines (${numCacheBlocks}) must be divisible by associativity (${ways}).`,
      };
    }
  }

  const numSets = Math.max(1, Math.floor(numCacheBlocks / ways));
  const indexBits = numSets === 1 ? 0 : Math.ceil(Math.log2(numSets));
  const tagBits = addressBits - indexBits - offsetBits;

  if (tagBits < 0) {
    return {
      ...empty,
      error: 'Tag bits became negative — increase Physical Memory or reduce Block/Set count.',
    };
  }

  // Valid bit (1) + optional Dirty bit (1 for write-back)
  const metaBitsPerBlock = writePolicy === 'write_back' ? 2 : 1;
  const tagDirectoryBits = numCacheBlocks * (tagBits + metaBitsPerBlock);
  const tagDirectoryBytes = tagDirectoryBits / 8;
  const tagDirectoryKB = tagDirectoryBytes / 1024;
  const totalSramKB = (cacheSizeBytes + tagDirectoryBytes) / 1024;

  return {
    valid: true,
    addressBits,
    tagBits,
    indexBits,
    offsetBits,
    numCacheBlocks,
    ways,
    numSets,
    metaBitsPerBlock,
    tagDirectoryBits,
    tagDirectoryBytes,
    tagDirectoryKB,
    totalSramKB,
  };
}

export interface VirtualMemoryInput {
  virtualAddressBits: number;
  physicalAddressBits: number;
  pageSizeBytes: number;
  pteSizeBytes: number;
}

export interface VirtualMemoryResult {
  valid: boolean;
  error?: string;
  vaBits: number;
  paBits: number;
  pageOffsetBits: number;
  vpnBits: number;
  pfnBits: number;
  totalPages: number;
  singleLevelPageTableBytes: number;
  singleLevelPageTableMB: number;
  entriesPerPage: number;
  bitsPerLevel: number;
  levelsRequired: number;
  levelBitSplits: Array<{ label: string; bits: number }>;
  outerPageTableBytes: number;
}

export function computeVirtualMemoryPageTable(input: VirtualMemoryInput): VirtualMemoryResult {
  const { virtualAddressBits, physicalAddressBits, pageSizeBytes, pteSizeBytes } = input;
  const empty: VirtualMemoryResult = {
    valid: false,
    vaBits: virtualAddressBits,
    paBits: physicalAddressBits,
    pageOffsetBits: 0,
    vpnBits: 0,
    pfnBits: 0,
    totalPages: 0,
    singleLevelPageTableBytes: 0,
    singleLevelPageTableMB: 0,
    entriesPerPage: 0,
    bitsPerLevel: 0,
    levelsRequired: 1,
    levelBitSplits: [],
    outerPageTableBytes: 0,
  };

  if (virtualAddressBits < 12 || virtualAddressBits > 64) {
    return { ...empty, error: 'Virtual address width must be between 12 and 64 bits.' };
  }
  if (physicalAddressBits < 12 || physicalAddressBits > 56) {
    return { ...empty, error: 'Physical address width must be between 12 and 56 bits.' };
  }
  if (pageSizeBytes < 64 || pteSizeBytes < 1 || pteSizeBytes >= pageSizeBytes) {
    return { ...empty, error: 'Page size must exceed PTE size.' };
  }

  const pageOffsetBits = Math.round(Math.log2(pageSizeBytes));
  const vpnBits = virtualAddressBits - pageOffsetBits;
  const pfnBits = Math.max(0, physicalAddressBits - pageOffsetBits);

  if (vpnBits <= 0) {
    return { ...empty, error: 'Page size is larger than virtual address space.' };
  }

  const totalPages = Math.pow(2, vpnBits);
  const singleLevelPageTableBytes = totalPages * pteSizeBytes;
  const singleLevelPageTableMB = singleLevelPageTableBytes / (1024 * 1024);

  const entriesPerPage = Math.floor(pageSizeBytes / pteSizeBytes);
  const bitsPerLevel = Math.max(1, Math.floor(Math.log2(entriesPerPage)));
  const levelsRequired = Math.max(1, Math.ceil(vpnBits / bitsPerLevel));

  const levelBitSplits: Array<{ label: string; bits: number }> = [];
  let remaining = vpnBits;
  for (let i = 0; i < levelsRequired; i++) {
    const isOuter = i === 0;
    const take = isOuter
      ? vpnBits - bitsPerLevel * (levelsRequired - 1)
      : bitsPerLevel;
    levelBitSplits.push({
      label: levelsRequired === 1 ? 'VPN' : `L${i + 1}`,
      bits: take,
    });
    remaining -= take;
  }
  if (remaining > 0 && levelBitSplits.length > 0) {
    levelBitSplits[0].bits += remaining;
  }

  const outerBits = levelBitSplits[0]?.bits ?? vpnBits;
  const outerPageTableBytes = Math.pow(2, outerBits) * pteSizeBytes;

  return {
    valid: true,
    vaBits: virtualAddressBits,
    paBits: physicalAddressBits,
    pageOffsetBits,
    vpnBits,
    pfnBits,
    totalPages,
    singleLevelPageTableBytes,
    singleLevelPageTableMB,
    entriesPerPage,
    bitsPerLevel,
    levelsRequired,
    levelBitSplits,
    outerPageTableBytes,
  };
}

// ===================== 3. DIGITAL LOGIC: IEEE-754 & 2'S COMPLEMENT =====================

export type IeeePrecision = 32 | 16;

export interface Ieee754Breakdown {
  valid: boolean;
  error?: string;
  precision: IeeePrecision;
  signBit: string;
  exponentBits: string;
  mantissaBits: string;
  fullBinary: string;
  hex: string;
  biasedExponent: number;
  bias: number;
  unbiasedExponent: number | null;
  classification: 'Normal' | 'Subnormal (Denormalized)' | 'Zero (+0)' | 'Zero (-0)' | '+Infinity' | '-Infinity' | 'NaN';
  reconstructedValue: string;
  formulaString: string;
}

function float32ToBits(val: number): number {
  const buf = new ArrayBuffer(4);
  const view = new DataView(buf);
  view.setFloat32(0, val, false);
  return view.getUint32(0, false);
}

function bitsToFloat32(bits: number): number {
  const buf = new ArrayBuffer(4);
  const view = new DataView(buf);
  view.setUint32(0, bits >>> 0, false);
  return view.getFloat32(0, false);
}

function floatToHalfBits(val: number): number {
  if (Number.isNaN(val)) return 0x7e00;
  const sign = Object.is(val, -0) || val < 0 ? 1 : 0;
  if (!Number.isFinite(val)) return (sign << 15) | 0x7c00;
  const absVal = Math.abs(val);
  if (absVal === 0) return sign << 15;

  // Max binary16 normal = 65504
  if (absVal >= 65520) return (sign << 15) | 0x7c00;

  // Subnormal threshold: 2^-14
  if (absVal < Math.pow(2, -14)) {
    const mant = Math.round(absVal / Math.pow(2, -24));
    if (mant >= 1024) {
      return (sign << 15) | (1 << 10);
    }
    return (sign << 15) | (mant & 0x3ff);
  }

  let exp = Math.floor(Math.log2(absVal));
  let mant = Math.round((absVal / Math.pow(2, exp) - 1) * 1024);
  if (mant === 1024) {
    mant = 0;
    exp += 1;
  }
  const biased = exp + 15;
  if (biased >= 31) return (sign << 15) | 0x7c00;
  return (sign << 15) | ((biased & 0x1f) << 10) | (mant & 0x3ff);
}

function decodeIeeeBits(bits: number, precision: IeeePrecision): Ieee754Breakdown {
  const expWidth = precision === 32 ? 8 : 5;
  const mantWidth = precision === 32 ? 23 : 10;
  const bias = precision === 32 ? 127 : 15;
  const allOnesExp = (1 << expWidth) - 1;
  const totalBits = precision;

  const fullBinary = (bits >>> 0).toString(2).padStart(totalBits, '0');
  const signBit = fullBinary.slice(0, 1);
  const exponentBits = fullBinary.slice(1, 1 + expWidth);
  const mantissaBits = fullBinary.slice(1 + expWidth);
  const hex = `0x${(bits >>> 0)
    .toString(16)
    .toUpperCase()
    .padStart(precision / 4, '0')}`;

  const biasedExponent = parseInt(exponentBits, 2);
  const mantInt = parseInt(mantissaBits, 2);
  const signChar = signBit === '1' ? '-' : '+';
  const signMult = signBit === '1' ? -1 : 1;

  let classification: Ieee754Breakdown['classification'] = 'Normal';
  let unbiasedExponent: number | null = biasedExponent - bias;
  let numericVal = 0;
  let formulaString = '';

  if (biasedExponent === allOnesExp) {
    unbiasedExponent = null;
    if (mantInt === 0) {
      classification = signBit === '1' ? '-Infinity' : '+Infinity';
      numericVal = signMult * Infinity;
      formulaString = `E = ${allOnesExp} (all 1s), M = 0 ⇒ ${classification}`;
    } else {
      classification = 'NaN';
      numericVal = NaN;
      formulaString = `E = ${allOnesExp} (all 1s), M ≠ 0 ⇒ NaN (Not a Number)`;
    }
  } else if (biasedExponent === 0) {
    if (mantInt === 0) {
      classification = signBit === '1' ? 'Zero (-0)' : 'Zero (+0)';
      unbiasedExponent = 1 - bias;
      numericVal = signBit === '1' ? -0 : 0;
      formulaString = `E = 0, M = 0 ⇒ ${signChar}0.0`;
    } else {
      classification = 'Subnormal (Denormalized)';
      unbiasedExponent = 1 - bias;
      const frac = mantInt / Math.pow(2, mantWidth);
      numericVal = signMult * frac * Math.pow(2, 1 - bias);
      formulaString = `(-1)^${signBit} × (0.${mantissaBits.replace(/0+$/, '') || '0'})₂ × 2^(${1 - bias})`;
    }
  } else {
    classification = 'Normal';
    unbiasedExponent = biasedExponent - bias;
    if (precision === 32) {
      numericVal = bitsToFloat32(bits);
    } else {
      const frac = 1 + mantInt / Math.pow(2, mantWidth);
      numericVal = signMult * frac * Math.pow(2, unbiasedExponent);
    }
    const trimmedMant = mantissaBits.replace(/0+$/, '') || '0';
    formulaString = `(-1)^${signBit} × (1.${trimmedMant})₂ × 2^(${biasedExponent} - ${bias} = ${unbiasedExponent})`;
  }

  let reconstructedValue: string;
  if (Number.isNaN(numericVal)) {
    reconstructedValue = 'NaN';
  } else if (!Number.isFinite(numericVal)) {
    reconstructedValue = numericVal < 0 ? '-Infinity' : '+Infinity';
  } else if (Object.is(numericVal, -0)) {
    reconstructedValue = '-0';
  } else {
    reconstructedValue = String(numericVal);
  }

  return {
    valid: true,
    precision,
    signBit,
    exponentBits,
    mantissaBits,
    fullBinary,
    hex,
    biasedExponent,
    bias,
    unbiasedExponent,
    classification,
    reconstructedValue,
    formulaString,
  };
}

export function decimalToIeee754(raw: string, precision: IeeePrecision = 32): Ieee754Breakdown {
  const trimmed = raw.trim().toLowerCase();
  const invalid: Ieee754Breakdown = {
    valid: false,
    error: 'Enter a decimal number (e.g. -13.625, 0.15625, -0, Infinity, NaN).',
    precision,
    signBit: '0',
    exponentBits: '0'.repeat(precision === 32 ? 8 : 5),
    mantissaBits: '0'.repeat(precision === 32 ? 23 : 10),
    fullBinary: '0'.repeat(precision),
    hex: precision === 32 ? '0x00000000' : '0x0000',
    biasedExponent: 0,
    bias: precision === 32 ? 127 : 15,
    unbiasedExponent: 0,
    classification: 'Zero (+0)',
    reconstructedValue: '0',
    formulaString: '',
  };

  if (!trimmed) return invalid;

  let val: number;
  if (trimmed === 'nan') {
    val = NaN;
  } else if (trimmed === 'inf' || trimmed === '+inf' || trimmed === 'infinity' || trimmed === '+infinity') {
    val = Infinity;
  } else if (trimmed === '-inf' || trimmed === '-infinity') {
    val = -Infinity;
  } else if (trimmed === '-0' || trimmed === '-0.0') {
    val = -0;
  } else {
    val = Number(trimmed);
    if (!Number.isFinite(val)) return invalid;
  }

  const bits = precision === 32 ? float32ToBits(val) : floatToHalfBits(val);
  return decodeIeeeBits(bits, precision);
}

export function hexToIeee754(raw: string, precision: IeeePrecision = 32): Ieee754Breakdown {
  const cleaned = raw.trim().replace(/^0x/i, '').replace(/[\s_]/g, '');
  const expectedDigits = precision / 4;
  if (!/^[0-9a-fA-F]+$/.test(cleaned) || cleaned.length > expectedDigits) {
    return {
      ...decimalToIeee754('0', precision),
      valid: false,
      error: `Enter up to ${expectedDigits} hex digits (e.g. ${precision === 32 ? 'C15A0000' : 'CADE'}).`,
    };
  }
  const bits = parseInt(cleaned.padStart(expectedDigits, '0'), 16) >>> 0;
  return decodeIeeeBits(bits, precision);
}

export interface TwosComplementResult {
  bitWidth: 4 | 8 | 16;
  minSigned: number;
  maxSigned: number;
  aClamped: number;
  bClamped: number;
  aBinary: string;
  bBinary: string;
  effectiveBBinary: string;
  resultBinary: string;
  signedResult: number;
  unsignedResult: number;
  carryInMsb: 0 | 1;
  carryOutMsb: 0 | 1;
  flags: {
    V: boolean; // Signed overflow (C_in_MSB ^ C_out_MSB)
    C: boolean; // Unsigned carry out
    N: boolean; // Negative (MSB === 1)
    Z: boolean; // Zero
  };
  trueMathResult: number;
}

export function toTwosBinary(val: number, bitWidth: number): string {
  const mask = (1 << bitWidth) - 1;
  return ((val & mask) >>> 0).toString(2).padStart(bitWidth, '0');
}

export function computeTwosComplement(
  bitWidth: 4 | 8 | 16,
  a: number,
  b: number,
  op: 'add' | 'sub'
): TwosComplementResult {
  const minSigned = -(1 << (bitWidth - 1));
  const maxSigned = (1 << (bitWidth - 1)) - 1;
  const mask = (1 << bitWidth) - 1;

  const aClamped = Math.max(minSigned, Math.min(maxSigned, Math.trunc(a)));
  const bClamped = Math.max(minSigned, Math.min(maxSigned, Math.trunc(b)));

  const aUnsigned = aClamped & mask;
  const bUnsigned = bClamped & mask;
  const effectiveBUnsigned = op === 'sub' ? ((~bUnsigned + 1) & mask) : bUnsigned;

  // Bit-by-bit ripple adder so C_in_MSB and C_out_MSB are exact
  let carry = 0;
  let carryInMsb: 0 | 1 = 0;
  let resultUnsigned = 0;
  for (let bit = 0; bit < bitWidth; bit++) {
    if (bit === bitWidth - 1) {
      carryInMsb = carry as 0 | 1;
    }
    const bitA = (aUnsigned >>> bit) & 1;
    const bitB = (effectiveBUnsigned >>> bit) & 1;
    const sum = bitA + bitB + carry;
    if (sum & 1) {
      resultUnsigned |= 1 << bit;
    }
    carry = sum >= 2 ? 1 : 0;
  }
  const carryOutMsb = carry as 0 | 1;

  const msb = (resultUnsigned >>> (bitWidth - 1)) & 1;
  const signedResult = msb === 1 ? resultUnsigned - (1 << bitWidth) : resultUnsigned;
  const trueMathResult = op === 'sub' ? aClamped - bClamped : aClamped + bClamped;

  // Exact overflow detection (handles sub with -minSigned cleanly too)
  const vFlag = trueMathResult < minSigned || trueMathResult > maxSigned;

  return {
    bitWidth,
    minSigned,
    maxSigned,
    aClamped,
    bClamped,
    aBinary: toTwosBinary(aClamped, bitWidth),
    bBinary: toTwosBinary(bClamped, bitWidth),
    effectiveBBinary: (effectiveBUnsigned >>> 0).toString(2).padStart(bitWidth, '0'),
    resultBinary: (resultUnsigned >>> 0).toString(2).padStart(bitWidth, '0'),
    signedResult,
    unsignedResult: resultUnsigned >>> 0,
    carryInMsb,
    carryOutMsb,
    flags: {
      V: vFlag,
      C: carryOutMsb === 1,
      N: msb === 1,
      Z: resultUnsigned === 0,
    },
    trueMathResult,
  };
}

// ===================== 4. COMPUTER NETWORKS: IPv4 CIDR & FRAGMENTATION =====================

export interface Ipv4CidrResult {
  valid: boolean;
  error?: string;
  ip: string;
  prefix: number;
  ipBinary: string;
  maskDotted: string;
  maskBinary: string;
  wildcardDotted: string;
  networkId: string;
  broadcastId: string;
  firstUsableHost: string;
  lastUsableHost: string;
  totalAddresses: number;
  usableHosts: number;
  ipClass: string;
  isPrivate: boolean;
}

export interface SubnetSlice {
  index: number;
  cidr: string;
  networkId: string;
  firstHost: string;
  lastHost: string;
  broadcastId: string;
  usableHosts: number;
}

export function intToIpv4(num: number): string {
  return [
    (num >>> 24) & 255,
    (num >>> 16) & 255,
    (num >>> 8) & 255,
    num & 255,
  ].join('.');
}

export function intToDottedBinary(num: number): string {
  return [
    ((num >>> 24) & 255).toString(2).padStart(8, '0'),
    ((num >>> 16) & 255).toString(2).padStart(8, '0'),
    ((num >>> 8) & 255).toString(2).padStart(8, '0'),
    (num & 255).toString(2).padStart(8, '0'),
  ].join('.');
}

export function parseIpv4CidrInput(input: string): { ipInt: number; prefix: number } | null {
  const trimmed = input.trim();
  const match = trimmed.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/);
  if (!match) return null;
  const octets = [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4])];
  const prefix = Number(match[5]);
  if (octets.some((o) => !Number.isInteger(o) || o < 0 || o > 255)) return null;
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return null;
  const ipInt =
    (((octets[0] << 24) >>> 0) + (octets[1] << 16) + (octets[2] << 8) + octets[3]) >>> 0;
  return { ipInt, prefix };
}

export function computeIpv4Cidr(cidrInput: string): Ipv4CidrResult {
  const parsed = parseIpv4CidrInput(cidrInput);
  if (!parsed) {
    return {
      valid: false,
      error: 'Enter valid IPv4 CIDR notation (e.g. 192.168.10.37/26).',
      ip: '',
      prefix: 24,
      ipBinary: '',
      maskDotted: '',
      maskBinary: '',
      wildcardDotted: '',
      networkId: '',
      broadcastId: '',
      firstUsableHost: '',
      lastUsableHost: '',
      totalAddresses: 0,
      usableHosts: 0,
      ipClass: '-',
      isPrivate: false,
    };
  }

  const { ipInt, prefix } = parsed;
  const maskInt = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const wildcardInt = (~maskInt) >>> 0;
  const networkInt = (ipInt & maskInt) >>> 0;
  const broadcastInt = (networkInt | wildcardInt) >>> 0;

  const totalAddresses = Math.pow(2, 32 - prefix);
  let usableHosts = 0;
  let firstHostInt = networkInt;
  let lastHostInt = broadcastInt;

  if (prefix === 32) {
    usableHosts = 1;
    firstHostInt = networkInt;
    lastHostInt = networkInt;
  } else if (prefix === 31) {
    usableHosts = 2; // RFC 3021 point-to-point
    firstHostInt = networkInt;
    lastHostInt = broadcastInt;
  } else {
    usableHosts = Math.max(0, totalAddresses - 2);
    firstHostInt = (networkInt + 1) >>> 0;
    lastHostInt = (broadcastInt - 1) >>> 0;
  }

  const firstOctet = (ipInt >>> 24) & 255;
  const secondOctet = (ipInt >>> 16) & 255;
  const ipClass =
    firstOctet < 128
      ? 'Class A'
      : firstOctet < 192
      ? 'Class B'
      : firstOctet < 224
      ? 'Class C'
      : firstOctet < 240
      ? 'Class D (Multicast)'
      : 'Class E (Reserved)';

  const isPrivate =
    firstOctet === 10 ||
    (firstOctet === 172 && secondOctet >= 16 && secondOctet <= 31) ||
    (firstOctet === 192 && secondOctet === 168);

  return {
    valid: true,
    ip: intToIpv4(ipInt),
    prefix,
    ipBinary: intToDottedBinary(ipInt),
    maskDotted: intToIpv4(maskInt),
    maskBinary: intToDottedBinary(maskInt),
    wildcardDotted: intToIpv4(wildcardInt),
    networkId: intToIpv4(networkInt),
    broadcastId: intToIpv4(broadcastInt),
    firstUsableHost: intToIpv4(firstHostInt),
    lastUsableHost: intToIpv4(lastHostInt),
    totalAddresses,
    usableHosts,
    ipClass,
    isPrivate,
  };
}

export function splitIpv4Subnets(cidrInput: string, borrowBits: number): SubnetSlice[] {
  const parsed = parseIpv4CidrInput(cidrInput);
  if (!parsed) return [];
  const safeBorrow = Math.max(1, Math.min(4, Math.floor(borrowBits)));
  const newPrefix = parsed.prefix + safeBorrow;
  if (newPrefix > 32) return [];

  const baseMask = parsed.prefix === 0 ? 0 : (0xffffffff << (32 - parsed.prefix)) >>> 0;
  const baseNetwork = (parsed.ipInt & baseMask) >>> 0;
  const subnetCount = 1 << safeBorrow;
  const blockSize = Math.pow(2, 32 - newPrefix);

  const slices: SubnetSlice[] = [];
  for (let i = 0; i < subnetCount; i++) {
    const net = (baseNetwork + i * blockSize) >>> 0;
    const bcast = (net + blockSize - 1) >>> 0;
    const usable = newPrefix === 32 ? 1 : newPrefix === 31 ? 2 : Math.max(0, blockSize - 2);
    const first = newPrefix >= 31 ? net : (net + 1) >>> 0;
    const last = newPrefix >= 31 ? bcast : (bcast - 1) >>> 0;
    slices.push({
      index: i + 1,
      cidr: `${intToIpv4(net)}/${newPrefix}`,
      networkId: intToIpv4(net),
      firstHost: intToIpv4(first),
      lastHost: intToIpv4(last),
      broadcastId: intToIpv4(bcast),
      usableHosts: usable,
    });
  }
  return slices;
}

export interface Ipv4FragmentRow {
  fragmentNumber: number;
  headerBytes: number;
  payloadBytes: number;
  totalLengthBytes: number;
  mfBit: 0 | 1;
  offsetBytes: number;
  fragmentOffsetField: number; // offsetBytes / 8
}

export interface Ipv4FragmentationResult {
  valid: boolean;
  error?: string;
  originalPayloadBytes: number;
  maxPayloadPerFragment: number;
  fragments: Ipv4FragmentRow[];
  totalTransmittedBytes: number;
  headerOverheadBytes: number;
}

export function computeIpv4Fragments(input: {
  totalDatagramBytes: number;
  headerBytes: number;
  mtuBytes: number;
}): Ipv4FragmentationResult {
  const { totalDatagramBytes, headerBytes, mtuBytes } = input;
  const empty: Ipv4FragmentationResult = {
    valid: false,
    originalPayloadBytes: 0,
    maxPayloadPerFragment: 0,
    fragments: [],
    totalTransmittedBytes: 0,
    headerOverheadBytes: 0,
  };

  if (headerBytes < 20 || headerBytes > 60 || headerBytes % 4 !== 0) {
    return { ...empty, error: 'IPv4 Header Length must be 20–60 bytes in multiples of 4.' };
  }
  if (totalDatagramBytes < headerBytes || totalDatagramBytes > 65535) {
    return { ...empty, error: 'Total Datagram Size must be between Header Length and 65535 B.' };
  }
  if (mtuBytes < headerBytes + 8) {
    return { ...empty, error: `Link MTU must be at least ${headerBytes + 8} B (Header + 8 B payload).` };
  }

  const originalPayloadBytes = totalDatagramBytes - headerBytes;
  const maxPayloadPerFragment = Math.floor((mtuBytes - headerBytes) / 8) * 8;

  if (originalPayloadBytes === 0) {
    return {
      valid: true,
      originalPayloadBytes: 0,
      maxPayloadPerFragment,
      fragments: [
        {
          fragmentNumber: 1,
          headerBytes,
          payloadBytes: 0,
          totalLengthBytes: headerBytes,
          mfBit: 0,
          offsetBytes: 0,
          fragmentOffsetField: 0,
        },
      ],
      totalTransmittedBytes: headerBytes,
      headerOverheadBytes: headerBytes,
    };
  }

  const fragments: Ipv4FragmentRow[] = [];
  let offsetBytes = 0;
  let remaining = originalPayloadBytes;
  let fragNum = 1;

  while (remaining > 0 && fragNum <= 200) {
    const isLast = remaining <= maxPayloadPerFragment;
    const payloadBytes = isLast ? remaining : maxPayloadPerFragment;
    fragments.push({
      fragmentNumber: fragNum,
      headerBytes,
      payloadBytes,
      totalLengthBytes: headerBytes + payloadBytes,
      mfBit: isLast ? 0 : 1,
      offsetBytes,
      fragmentOffsetField: offsetBytes / 8,
    });
    offsetBytes += payloadBytes;
    remaining -= payloadBytes;
    fragNum += 1;
  }

  const totalTransmittedBytes = fragments.reduce((acc, f) => acc + f.totalLengthBytes, 0);
  const headerOverheadBytes = fragments.length * headerBytes;

  return {
    valid: true,
    originalPayloadBytes,
    maxPayloadPerFragment,
    fragments,
    totalTransmittedBytes,
    headerOverheadBytes,
  };
}
