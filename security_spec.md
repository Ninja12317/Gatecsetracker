# GATE '27 // WAR ROOM — Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. **Strict Owner Scoping (Zero Cross-User Leaks)**: Every document across all 11 paths under `/users/{userId}` (including `verified_answers/{questionId}`) belongs strictly to the authenticated, email-verified user where `request.auth.uid == userId` and `data.ownerId == request.auth.uid`.
2. **Master Gate Relational Sync**: Every subcollection write under `/users/{userId}/...` requires the parent `/users/{userId}` document to exist (via `exists()`), ensuring orphaned subcollection writes are impossible.
3. **Zero Shadow Fields & Strict Schemas**: Every `create` verifies `keys().hasAll(...) && keys().hasOnly(...)` and every `update` starts with `isValid[Entity](incoming())` plus explicit `affectedKeys().hasOnly(...)` action allowlists.
4. **Temporal & Immutability Integrity**: Server-only timestamps (`request.time`) are enforced on `createdAt` (immutable after create) and `updatedAt`. `ownerId` and ID fields are immutable on update.
5. **Bounded Payloads & Path Hardening**: Every single-document ID path variable passes `isValidId()` (`^[a-zA-Z0-9_\-]+$`, max 128 chars). Every string and array enforces explicit `.size()` ceilings to prevent Denial-of-Wallet attacks.
6. **Secure List Queries**: Every `allow list` verifies `isSignedIn() && isVerified() && isOwner(userId) && resource.data.ownerId == request.auth.uid` without `get()`/`exists()` calls.

## 2. The "Dirty Dozen" Adversarial Payloads (Must All Return PERMISSION_DENIED)
1. **Cross-User Read/Write**: User B (`uid-b`) reads or writes `/users/uid-a/meta/workspace`.
2. **Unverified Email Spoof**: Request has `request.auth.uid == "uid-a"` but `request.auth.token.email_verified == false`.
3. **Owner Identity Spoofing on Create**: User A creates `/users/uid-a/mocks/m1` with `ownerId: "uid-b"`.
4. **Shadow / Ghost Field Injection**: User A creates `/users/uid-a/meta/workspace` adding unexpected `"isAdmin": true` or `"role": "superadmin"`.
5. **ID Poisoning Attack**: User A writes to `/users/uid-a/mocks/../../evil$id` or a 200-char document ID.
6. **Client-Forged Timestamp**: User A writes `/users/uid-a/study_logs/log1` with a client-supplied past timestamp instead of `request.time`.
7. **Immutable Field Mutation**: User A updates `/users/uid-a/pyq_bank/q1` trying to change `ownerId` or `createdAt`.
8. **Out-of-Range Enum / Score Poisoning**: User A writes a mock test with `score: 9999` or `accuracy: 150` or invalid `subjectId: "hacking"`.
9. **Denial-of-Wallet Unbounded String**: User A writes a 50,000-character string into `notes` (limit 4,000) or `title` (limit 180).
10. **Denial-of-Wallet Unbounded Array**: User A writes 500 elements into `bookmarkedQuestions` (limit 200) or non-string element at index 0.
11. **Orphaned Subcollection Write**: User A writes `/users/uid-a/syllabus/ga-verbal` before parent `/users/uid-a` exists.
12. **Blanket List Scraping**: User B runs a collection list query on `/users/uid-a/pyq_bank` or root `/users`.
