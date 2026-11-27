import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GATE_2027_MASTER_VAULT } from '../data/gate27FormulaTrapBundle.ts';
import {
  VALID_VAULT_SUBJECTS,
  isRemovedInGate2027,
  matchPyqsForVaultCard,
  mineMistakesToVaultCards,
  parseAndCategorizeBulkJson,
  resolveGithubVaultCandidateUrls,
  splitPackForFirestore,
  vaultCardToTipItem,
} from './vaultImporter.ts';
import { buildVaultCheatSheetPdf } from './pdfExporter.ts';
import type { MistakeEntry, Question } from '../types/index.ts';

describe('GATE 2027 Offline Master Vault Bundle', () => {
  it('contains at least 144 cards with >= 12 cards per all 12 official GATE CSE subjects', () => {
    assert.ok(
      GATE_2027_MASTER_VAULT.length >= 144,
      `Expected >= 144 master cards, got ${GATE_2027_MASTER_VAULT.length}`
    );

    const counts: Record<string, number> = {};
    const ids = new Set<string>();

    for (const card of GATE_2027_MASTER_VAULT) {
      assert.ok(!ids.has(card.id), `Duplicate master card id: ${card.id}`);
      ids.add(card.id);
      assert.ok(card.title.trim().length >= 5, `Empty title on ${card.id}`);
      assert.ok(card.gateTruth.trim().length >= 20, `Short gateTruth on ${card.id}`);
      assert.ok(card.tagMatchKeywords.length >= 2, `Missing tagMatchKeywords on ${card.id}`);
      assert.equal(card.source, 'Master Bundle');
      assert.notEqual(card.outOf2027Syllabus, true, `Master card flagged removed: ${card.id}`);
      counts[card.subject] = (counts[card.subject] ?? 0) + 1;
    }

    for (const subj of VALID_VAULT_SUBJECTS) {
      assert.ok(
        (counts[subj] ?? 0) >= 12,
        `Subject ${subj} has only ${counts[subj] ?? 0} master cards (need >= 12)`
      );
    }
  });

  it('strictly excludes removed 2027 syllabus topics from built-in Master Bundle', () => {
    for (const card of GATE_2027_MASTER_VAULT) {
      const text = `${card.title} ${card.subtopic} ${card.gateTruth} ${card.commonTrap ?? ''}`;
      assert.equal(
        isRemovedInGate2027(text),
        false,
        `Built-in master card ${card.id} ("${card.title}") mentions a removed GATE 2027 topic!`
      );
    }
  });
});

describe('Bulk JSON Importer & Smart Auto-Categorizer', () => {
  it('parses fenced markdown JSON with trailing commas, loose keys, auto-categorization, deduplication, and 2027 flagging', () => {
    const rawPayload = `Here are your cards:
\`\`\`json
{
  "cards": [
    {
      "title": "B+ Tree Internal Node Fan-Out",
      "formula": "p * P_b + (p - 1) * K <= B",
      "trap": "Adding record pointer P_r to internal nodes",
      "truth": "Only B-tree internal nodes hold record pointers; B+ internal nodes store block pointers and keys only.",
    },
    {
      "subject": "Computer Networks",
      "title": "UDP Header Length Trap",
      "category": "Exam Trap",
      "detail": "UDP header is fixed 8 bytes with optional checksum in IPv4.",
    },
    {
      "title": "B+ Tree Internal Node Fan-Out",
      "truth": "Duplicate of first card should be skipped automatically."
    },
    {
      "title": "TLB + L-Level Page Table Effective Memory Access Time (EMAT)",
      "subject": "os",
      "truth": "Duplicate of Master Bundle card should be skipped."
    }
  ]
}
\`\`\``;

    const res = parseAndCategorizeBulkJson(rawPayload, {
      packName: 'Unit Test Pack',
      existingCards: GATE_2027_MASTER_VAULT,
    });

    assert.equal(res.ok, true);
    assert.equal(res.stats.totalParsed, 4);
    assert.equal(res.stats.added, 2);
    assert.equal(res.stats.duplicatesSkipped, 2);
    assert.equal(res.stats.outOf2027Flagged, 1);
    assert.ok(res.stats.autoCategorizedCount >= 1);

    const bplus = res.cards.find((c) => c.title.includes('B+ Tree'));
    assert.ok(bplus);
    assert.equal(bplus.subject, 'dbms');
    assert.equal(bplus.kind, 'FORMULA');
    assert.equal(bplus.outOf2027Syllabus, undefined);

    const udp = res.cards.find((c) => c.title.includes('UDP'));
    assert.ok(udp);
    assert.equal(udp.subject, 'cn');
    assert.equal(udp.kind, 'TRAP');
    assert.equal(udp.outOf2027Syllabus, true);
  });

  it('splits large 320-card packs into Firestore-safe <=150 card chunks', () => {
    const bigArray = Array.from({ length: 320 }, (_, i) => ({
      subject: 'algo',
      title: `Algorithm Formula Card #${i + 1}`,
      gateTruth: `Recurrence invariant and proof detail number ${i + 1} for GATE CSE 2027.`,
    }));
    const res = parseAndCategorizeBulkJson(JSON.stringify(bigArray), { packName: 'Mega 320' });
    assert.equal(res.ok, true);
    assert.ok(res.pack);
    assert.equal(res.pack.cardCount, 320);

    const chunks = splitPackForFirestore(res.pack, 150);
    assert.equal(chunks.length, 3);
    assert.equal(chunks[0].cardCount, 150);
    assert.equal(chunks[1].cardCount, 150);
    assert.equal(chunks[2].cardCount, 20);
  });
});

describe('GitHub Vault URL Resolver (SSRF Safety)', () => {
  it('blocks non-GitHub hosts and HTTP URLs', () => {
    assert.equal(resolveGithubVaultCandidateUrls('http://github.com/user/repo').ok, false);
    assert.equal(resolveGithubVaultCandidateUrls('https://localhost:3000/vault.json').ok, false);
    assert.equal(resolveGithubVaultCandidateUrls('https://169.254.169.254/latest/meta-data').ok, false);
  });

  it('converts github.com blob URLs to raw.githubusercontent.com and expands repo roots', () => {
    const blob = resolveGithubVaultCandidateUrls(
      'https://github.com/nihalpawar/gate27-notes/blob/main/formulas.json'
    );
    assert.equal(blob.ok, true);
    assert.deepEqual(blob.urls, [
      'https://raw.githubusercontent.com/nihalpawar/gate27-notes/main/formulas.json',
    ]);

    const root = resolveGithubVaultCandidateUrls('https://github.com/nihalpawar/gate27-notes');
    assert.equal(root.ok, true);
    assert.ok(root.urls.length >= 8);
    assert.ok(root.urls.every((u) => u.startsWith('https://raw.githubusercontent.com/')));
  });
});

describe('Local Mistake Miner, PYQ Matcher & A4 Formula Cheat Sheet PDF', () => {
  const sampleQs: Question[] = [
    {
      id: 'q_os_tlb_1',
      subjectId: 'os',
      subtopic: 'Virtual Memory & TLB',
      format: 'NAT',
      marks: 2,
      difficulty: 'Medium',
      sourceTag: 'GATE CSE 2024 Set 1',
      prompt: 'A 2-level paging system has TLB hit ratio 0.9 and memory access 100ns. Find EMAT.',
      explanation: 'EMAT = 0.9*(10+100) + 0.1*(10+300) = 130ns.',
      wrongOptionAnalysis: 'Remember L+1 memory accesses on TLB miss.',
    },
    {
      id: 'q_os_sched_1',
      subjectId: 'os',
      subtopic: 'CPU Scheduling',
      format: 'MCQ',
      marks: 1,
      difficulty: 'Easy',
      sourceTag: 'GATE CSE 2023',
      prompt: 'Which scheduling algorithm minimizes average waiting time?',
      explanation: 'SRTF minimizes average waiting time.',
      wrongOptionAnalysis: 'Round robin does not minimize waiting time.',
    },
  ];

  it('mines unresolved mistakes into My Mistakes VaultCards offline and matches GateR PYQs', () => {
    const mistakes: Record<string, MistakeEntry> = {
      q_os_tlb_1: {
        questionId: 'q_os_tlb_1',
        errorTag: 'Silly Math',
        wrongCount: 2,
        lastAttemptedAt: '2026-11-20',
        resolved: false,
        userNote: 'Forgot +1 data fetch',
      },
    };
    const mined = mineMistakesToVaultCards(mistakes, sampleQs);
    assert.equal(mined.length, 1);
    assert.equal(mined[0].source, 'My Mistakes');
    assert.equal(mined[0].subject, 'os');

    const tlbMasterCard = GATE_2027_MASTER_VAULT.find((c) => c.id === 'mv_os_05')!;
    const matched = matchPyqsForVaultCard(tlbMasterCard, sampleQs, 5);
    assert.equal(matched[0].id, 'q_os_tlb_1');

    const legacyTip = vaultCardToTipItem(tlbMasterCard);
    assert.equal(legacyTip.subjectId, 'os');
    assert.ok(legacyTip.detail.length > 10);
  });

  it('generates a multi-page A4 Formula Cheat Sheet PDF cleanly in Node', () => {
    const { doc, filename, pageCount } = buildVaultCheatSheetPdf(
      GATE_2027_MASTER_VAULT.slice(0, 24),
      {
        title: 'GATE CSE 2027 Formula Cheat Sheet',
        subtitle: 'Unit Test Export',
        generatedAt: '2026-11-26T10:00:00Z',
      }
    );
    assert.ok(filename.endsWith('.pdf'));
    assert.ok(pageCount >= 2, `Expected >= 2 PDF pages for 24 cards, got ${pageCount}`);
    const arrayBuf = doc.output('arraybuffer');
    assert.ok(arrayBuf.byteLength > 2000);
  });
});
