import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const blueprintPath = path.resolve(process.cwd(), 'firebase-blueprint.json');
const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
const draftRulesPath = path.resolve(process.cwd(), 'DRAFT_firestore.rules');

function readActiveRules(): string {
  if (fs.existsSync(rulesPath)) return fs.readFileSync(rulesPath, 'utf8');
  return fs.readFileSync(draftRulesPath, 'utf8');
}

test('Firestore rules cover every collection in firebase-blueprint.json', () => {
  const blueprint = JSON.parse(fs.readFileSync(blueprintPath, 'utf8')) as {
    firestore: Record<string, unknown>;
  };
  const rules = readActiveRules();

  assert.match(rules, /rules_version\s*=\s*'2'/);
  assert.match(rules, /match \/\{document=\*\*\}\s*\{\s*allow read, write: if false;/);

  const subcollections = [
    'meta/{metaId}',
    'syllabus/{subtopicId}',
    'study_logs/{logId}',
    'attempts/{questionId}',
    'mistakes/{questionId}',
    'sketches/{questionId}',
    'mocks/{mockId}',
    'custom_tips/{tipId}',
    'pyq_bank/{questionId}',
    'verified_answers/{questionId}',
    'traps_vault/{trapId}',
    'srs_cards/{cardId}',
    'ga_streak/{dateIso}',
    'trace_tables/{questionId}',
    'vault_packs/{packId}',
    'daily_progress/{docId}',
    'rough_work/{docId}',
  ];

  assert.equal(Object.keys(blueprint.firestore).length, 18);
  for (const sub of subcollections) {
    assert.ok(rules.includes(`match /${sub}`), `Missing match block for /${sub}`);
  }
});

test('Dirty Dozen security assertions are enforced in rules', () => {
  const rules = readActiveRules();

  // 1. Verified email gate
  assert.ok(rules.includes('request.auth.token.email_verified == true'));

  // 2. Owner scoping on list without blanket allow list: if isSignedIn();
  assert.ok(!/allow\s+list:\s*if\s*isSignedIn\(\)\s*;/.test(rules));
  assert.ok(rules.includes('resource.data.ownerId == request.auth.uid'));

  // 3. Master Gate parentUserExists on subcollection writes
  assert.ok(rules.includes('function parentUserExists(userId)'));
  assert.ok(rules.includes('parentUserExists(userId)'));

  // 4. ID poisoning guard
  assert.ok(rules.includes("id.matches('^[a-zA-Z0-9_\\\\-]+$')"));

  // 5. Server timestamp integrity
  assert.ok(rules.includes('incoming().createdAt == request.time'));
  assert.ok(rules.includes('incoming().updatedAt == request.time'));

  // 6. Strict keys hasAll + hasOnly preventing shadow fields
  assert.ok(rules.includes('data.keys().hasAll('));
  assert.ok(rules.includes('data.keys().hasOnly('));
  assert.ok(rules.includes('affectedKeys().hasOnly('));

  // 7. Data URL format & size ceiling on saved sketches
  assert.ok(rules.includes('^data:image/(png|webp|jpeg);base64,[A-Za-z0-9+/=]+$'));
  assert.ok(rules.includes('data.dataUrl.size() <= 450000'));

  // 8. Theme persistence fields explicitly validated and allowlisted
  assert.ok(
    rules.includes(
      "data.accentTheme in ['brown', 'green', 'red', 'blue', 'teal', 'graphite', 'navy', 'olive']"
    )
  );
  assert.ok(rules.includes("isOptionalBoundedNumber(data, 'accentUpdatedAt', 0, 9999999999999)"));
});
