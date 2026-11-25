import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TOC_CLOSURE_ROWS,
  TOC_DECIDABILITY_ROWS,
  TOC_LANGUAGES,
  pickQuizCells,
  computeCacheBitSplit,
  computeVirtualMemoryPageTable,
  decimalToIeee754,
  hexToIeee754,
  computeTwosComplement,
  computeIpv4Cidr,
  splitIpv4Subnets,
  computeIpv4Fragments,
} from './csLabMath.ts';

test('TOC matrix enforces exact GATE CSE closure & decidability facts', () => {
  assert.equal(TOC_LANGUAGES.length, 6);
  const comp = TOC_CLOSURE_ROWS.find((r) => r.id === 'complement');
  assert.ok(comp);
  assert.equal(comp.values.regular, true);
  assert.equal(comp.values.dcfl, true);
  assert.equal(comp.values.cfl, false);
  assert.equal(comp.values.csl, true);
  assert.equal(comp.values.recursive, true);
  assert.equal(comp.values.re, false);

  const eq = TOC_DECIDABILITY_ROWS.find((r) => r.id === 'equivalence');
  assert.ok(eq);
  assert.equal(eq.values.regular, true);
  assert.equal(eq.values.dcfl, true);
  assert.equal(eq.values.cfl, false);

  const picked = pickQuizCells(TOC_CLOSURE_ROWS, 10, false, 42);
  assert.equal(picked.length, 10);
  assert.equal(new Set(picked).size, 10);
});

test('COA Cache bit-split computes exact Tag/Index/Offset and Tag Directory overhead', () => {
  // 4 GB physical memory (32-bit), 64 KB cache, 64 B block, 4-way set associative
  const res = computeCacheBitSplit({
    physicalMemoryBytes: 4 * 1024 * 1024 * 1024,
    cacheSizeBytes: 64 * 1024,
    blockSizeBytes: 64,
    associativityMode: 'set_associative',
    kWay: 4,
    writePolicy: 'write_back',
  });
  assert.equal(res.valid, true);
  assert.equal(res.addressBits, 32);
  assert.equal(res.offsetBits, 6);
  assert.equal(res.numCacheBlocks, 1024);
  assert.equal(res.numSets, 256);
  assert.equal(res.indexBits, 8);
  assert.equal(res.tagBits, 18);
  assert.equal(res.tagDirectoryBits, 1024 * (18 + 2));

  // Fully associative has 0 index bits
  const fa = computeCacheBitSplit({
    physicalMemoryBytes: 1024 * 1024,
    cacheSizeBytes: 16 * 1024,
    blockSizeBytes: 32,
    associativityMode: 'fully_associative',
    kWay: 1,
  });
  assert.equal(fa.valid, true);
  assert.equal(fa.indexBits, 0);
  assert.equal(fa.offsetBits, 5);
  assert.equal(fa.tagBits, 15);
});

test('COA Virtual Memory computes exact multi-level page table breakdown', () => {
  // Classic 32-bit VA, 4 KB page, 4 B PTE -> 2-level page table (10 | 10 | 12)
  const vm = computeVirtualMemoryPageTable({
    virtualAddressBits: 32,
    physicalAddressBits: 32,
    pageSizeBytes: 4096,
    pteSizeBytes: 4,
  });
  assert.equal(vm.valid, true);
  assert.equal(vm.pageOffsetBits, 12);
  assert.equal(vm.vpnBits, 20);
  assert.equal(vm.entriesPerPage, 1024);
  assert.equal(vm.levelsRequired, 2);
  assert.deepEqual(
    vm.levelBitSplits.map((l) => l.bits),
    [10, 10]
  );
  assert.equal(vm.singleLevelPageTableMB, 4);
});

test('Digital Logic IEEE-754 handles -13.625, hex roundtrip, subnormal, infinity & NaN', () => {
  const f = decimalToIeee754('-13.625', 32);
  assert.equal(f.valid, true);
  assert.equal(f.signBit, '1');
  assert.equal(f.biasedExponent, 130);
  assert.equal(f.unbiasedExponent, 3);
  assert.equal(f.hex, '0xC15A0000');
  assert.equal(f.classification, 'Normal');

  const fromHex = hexToIeee754('C15A0000', 32);
  assert.equal(fromHex.valid, true);
  assert.equal(fromHex.reconstructedValue, '-13.625');

  const sub = hexToIeee754('00000001', 32);
  assert.equal(sub.classification, 'Subnormal (Denormalized)');

  const inf = decimalToIeee754('-Infinity', 32);
  assert.equal(inf.classification, '-Infinity');

  const nan = decimalToIeee754('NaN', 32);
  assert.equal(nan.classification, 'NaN');

  const half = decimalToIeee754('-13.625', 16);
  assert.equal(half.valid, true);
  assert.equal(half.signBit, '1');
});

test('Digital Logic 2s complement detects exact signed overflow (V) and carry (C)', () => {
  // 8-bit: 100 + 50 = 150 > 127 -> Overflow V=true, N=true
  const ov = computeTwosComplement(8, 100, 50, 'add');
  assert.equal(ov.flags.V, true);
  assert.equal(ov.flags.N, true);
  assert.equal(ov.signedResult, -106);

  // 8-bit: 12 - 12 = 0 -> Z=true, V=false
  const zero = computeTwosComplement(8, 12, 12, 'sub');
  assert.equal(zero.flags.Z, true);
  assert.equal(zero.flags.V, false);
  assert.equal(zero.signedResult, 0);
});

test('CN IPv4 CIDR & IPv4 Fragmentation compute exact GATE CSE values', () => {
  const cidr = computeIpv4Cidr('192.168.10.37/26');
  assert.equal(cidr.valid, true);
  assert.equal(cidr.networkId, '192.168.10.0');
  assert.equal(cidr.broadcastId, '192.168.10.63');
  assert.equal(cidr.firstUsableHost, '192.168.10.1');
  assert.equal(cidr.lastUsableHost, '192.168.10.62');
  assert.equal(cidr.usableHosts, 62);
  assert.equal(cidr.maskDotted, '255.255.255.192');

  const subnets = splitIpv4Subnets('192.168.10.37/26', 2);
  assert.equal(subnets.length, 4);
  assert.equal(subnets[1].cidr, '192.168.10.16/28');

  // Classic GATE IPv4 Fragmentation: 4000B datagram, 20B header, 1500B MTU
  // Max payload per frag = floor(1480/8)*8 = 1480B. Payload = 3980B -> 1480, 1480, 1020
  const frags = computeIpv4Fragments({
    totalDatagramBytes: 4000,
    headerBytes: 20,
    mtuBytes: 1500,
  });
  assert.equal(frags.valid, true);
  assert.equal(frags.maxPayloadPerFragment, 1480);
  assert.equal(frags.fragments.length, 3);
  assert.equal(frags.fragments[0].fragmentOffsetField, 0);
  assert.equal(frags.fragments[0].mfBit, 1);
  assert.equal(frags.fragments[1].fragmentOffsetField, 185);
  assert.equal(frags.fragments[1].mfBit, 1);
  assert.equal(frags.fragments[2].payloadBytes, 1020);
  assert.equal(frags.fragments[2].fragmentOffsetField, 370);
  assert.equal(frags.fragments[2].mfBit, 0);
});
