import type { Question } from '../types';

export const GATE_QUESTION_BANK: Question[] = [
  // ===================== GENERAL APTITUDE (3) =====================
  {
    id: 'q-ga-1',
    subjectId: 'ga',
    subtopic: 'Quantitative · Exponents',
    format: 'MCQ',
    marks: 1,
    difficulty: 'Easy',
    sourceTag: 'PYQ Pattern · GA',
    prompt: 'If 2^(x − 1) + 2^(x + 1) = 320, what is the value of x?',
    options: [
      { id: 'A', text: '6' },
      { id: 'B', text: '7' },
      { id: 'C', text: '8' },
      { id: 'D', text: '9' },
    ],
    correctOption: 'B',
    explanation:
      'Factor out 2^(x − 1): 2^(x − 1) · (1 + 2^2) = 320 ⇒ 2^(x − 1) · 5 = 320 ⇒ 2^(x − 1) = 64 = 2^6 ⇒ x − 1 = 6 ⇒ x = 7.',
    wrongOptionAnalysis:
      'Option A (6) comes from forgetting the −1 in the exponent (setting 2^x = 64 instead of 2^(x−1) = 64). Option C (8) comes from mis-factoring 2^(x+1) as 2·2^(x−1).',
  },
  {
    id: 'q-ga-2',
    subjectId: 'ga',
    subtopic: 'Quantitative · Probability',
    format: 'NAT',
    marks: 2,
    difficulty: 'Medium',
    sourceTag: 'GO-Style Concept DPP',
    prompt:
      'A fair six-sided die is rolled twice independently. What is the probability that the sum of the two outcomes is divisible by 4? (Round to 2 decimal places.)',
    natAnswer: 0.25,
    natTolerance: 0.005,
    explanation:
      'Sample space has 36 equally likely pairs. Sums divisible by 4 are 4, 8, and 12. Count(4) = 3 {(1,3),(2,2),(3,1)}; Count(8) = 5 {(2,6),(3,5),(4,4),(5,3),(6,2)}; Count(12) = 1 {(6,6)}. Total favorable outcomes = 3 + 5 + 1 = 9. Probability = 9/36 = 0.25.',
    wrongOptionAnalysis:
      'A frequent slip is forgetting (6,6) for sum 12 or double-counting (2,2) and (4,4), giving 8/36 ≈ 0.22 or 10/36 ≈ 0.28.',
  },
  {
    id: 'q-ga-3',
    subjectId: 'ga',
    subtopic: 'Analytical · Deductive Logic',
    format: 'MSQ',
    marks: 2,
    difficulty: 'Medium',
    sourceTag: 'PYQ Pattern · GA MSQ',
    prompt:
      'Given the premise: "Every compiler that passes benchmark B uses SSA form, and no interpreter uses SSA form." Which of the following statements MUST be logically true?',
    options: [
      { id: 'A', text: 'No interpreter passes benchmark B.' },
      { id: 'B', text: 'Every tool that uses SSA form passes benchmark B.' },
      { id: 'C', text: 'Any compiler that does not use SSA form fails benchmark B.' },
      { id: 'D', text: 'Some compilers do not use SSA form.' },
    ],
    correctOptions: ['A', 'C'],
    explanation:
      'Let C(x): compiler, B(x): passes benchmark B, S(x): uses SSA, I(x): interpreter. Premise 1: ∀x (C(x) ∧ B(x) → S(x)). Wait: assuming only compilers/interpreters or even generally: if an interpreter passed B and were a compiler—more strictly, "No interpreter uses SSA" means I(x) → ¬S(x). If "passes benchmark B" applies to compilers under evaluation, wait: contrapositive of (C ∧ B → S) is (C ∧ ¬S → ¬B), which is exactly Option C. For Option A, within the universe of compilers & interpreters tested on benchmark B where passing B requires SSA, ¬S implies failing B, so no interpreter passes B.',
    wrongOptionAnalysis:
      'Option B commits the converse fallacy (S → B does not follow from B → S). Option D assumes existential import that is never stated in universal premises.',
  },

  // ===================== ENGINEERING MATHEMATICS (5) =====================
  {
    id: 'q-em-1',
    subjectId: 'em',
    subtopic: 'Linear Algebra · Eigenvalues',
    format: 'NAT',
    marks: 2,
    difficulty: 'Easy',
    sourceTag: 'PYQ Pattern · EM',
    prompt:
      'Consider the 3 × 3 real matrix A whose rows are [2, 4, 6], [1, 2, 3], and [3, 6, 9]. What is the largest eigenvalue of A?',
    natAnswer: 13,
    natTolerance: 0,
    explanation:
      'Every row of A is a scalar multiple of [1, 2, 3], so Rank(A) = 1. A 3×3 rank-1 matrix has eigenvalue 0 with algebraic multiplicity at least 2. Since the sum of eigenvalues equals Trace(A) = 2 + 2 + 9 = 13, the eigenvalues are {13, 0, 0}. Thus the largest eigenvalue is 13.',
    wrongOptionAnalysis:
      'Expanding det(A − λI) = 0 manually wastes 3 minutes and invites sign errors. Recognizing rank-1 gives Trace(A) instantly.',
  },
  {
    id: 'q-em-2',
    subjectId: 'em',
    subtopic: 'Discrete Math · First-Order Logic',
    format: 'MCQ',
    marks: 2,
    difficulty: 'Easy',
    sourceTag: 'GO-Style Concept DPP',
    prompt: 'Which first-order logic formula is logically equivalent to ¬(∀x (P(x) → Q(x)))?',
    options: [
      { id: 'A', text: '∃x (P(x) → ¬Q(x))' },
      { id: 'B', text: '∃x (P(x) ∧ ¬Q(x))' },
      { id: 'C', text: '∀x (P(x) ∧ ¬Q(x))' },
      { id: 'D', text: '∃x (¬P(x) ∨ Q(x))' },
    ],
    correctOption: 'B',
    explanation:
      'Rewrite implication first: ∀x (¬P(x) ∨ Q(x)). Push negation inward using De Morgan for quantifiers: ∃x ¬(¬P(x) ∨ Q(x)) ≡ ∃x (P(x) ∧ ¬Q(x)).',
    wrongOptionAnalysis:
      'Option A is the #1 GATE trap: ¬(P → Q) is NOT (P → ¬Q). When P(x) is false for some x, P(x) → ¬Q(x) becomes vacuously TRUE, whereas ¬(∀x(P→Q)) requires a witness where P is TRUE and Q is FALSE.',
  },
  {
    id: 'q-em-3',
    subjectId: 'em',
    subtopic: 'Combinatorics · Surjections',
    format: 'NAT',
    marks: 2,
    difficulty: 'Medium',
    sourceTag: 'PYQ Pattern · EM',
    prompt:
      'How many onto (surjective) functions exist from a set A of size 4 to a set B of size 3?',
    natAnswer: 36,
    natTolerance: 0,
    explanation:
      'By Inclusion-Exclusion, the number of surjections from an m-set to an n-set is ∑_{k=0}^{n} (−1)^k C(n,k)(n−k)^m. For m = 4, n = 3: 3^4 − C(3,1)·2^4 + C(3,2)·1^4 = 81 − 48 + 3 = 36. Equivalently, choose 2 elements of A to share a target: C(4,2) = 6, then assign the 3 blocks bijectively to B in 3! = 6 ways ⇒ 6 × 6 = 36.',
    wrongOptionAnalysis:
      'Answering 81 counts ALL functions (including non-surjective). Answering 24 = 4! forgets that two elements in A must collide into the same image in B.',
  },
  {
    id: 'q-em-4',
    subjectId: 'em',
    subtopic: 'Probability · Bayes Theorem',
    format: 'MCQ',
    marks: 2,
    difficulty: 'Medium',
    sourceTag: 'PYQ Pattern · EM',
    prompt:
      'A box contains two coins: one fair coin (P(H) = 0.5) and one two-headed coin (P(H) = 1). One coin is picked uniformly at random and tossed twice. Both tosses result in Heads. What is the probability that the two-headed coin was picked?',
    options: [
      { id: 'A', text: '2/3' },
      { id: 'B', text: '3/4' },
      { id: 'C', text: '4/5' },
      { id: 'D', text: '5/6' },
    ],
    correctOption: 'C',
    explanation:
      'Let T be the event of picking the two-headed coin and HH be two Heads. P(T) = P(F) = 1/2. P(HH | T) = 1, P(HH | F) = (1/2)^2 = 1/4. By Bayes Theorem: P(T | HH) = (0.5 × 1) / (0.5 × 1 + 0.5 × 0.25) = 0.5 / 0.625 = 4/5.',
    wrongOptionAnalysis:
      'Option A (2/3) is the answer after only ONE Head toss (0.5 / 0.75). Option B (3/4) miscomputes conditional denominator as 1 + 1/3.',
  },
  {
    id: 'q-em-5',
    subjectId: 'em',
    subtopic: 'Discrete Math · Groups & Graphs',
    format: 'MSQ',
    marks: 2,
    difficulty: 'Hard',
    sourceTag: 'GO-Style Concept DPP',
    prompt: 'Which of the following statements are ALWAYS true?',
    options: [
      { id: 'A', text: 'Every group of prime order p is cyclic and abelian.' },
      { id: 'B', text: 'Every simple planar graph has at least one vertex of degree ≤ 5.' },
      { id: 'C', text: 'A graph is bipartite if and only if it contains no cycles of even length.' },
      { id: 'D', text: 'In any finite group G, the order of every subgroup H divides |G|.' },
    ],
    correctOptions: ['A', 'B', 'D'],
    explanation:
      '(A) By Lagrange\'s theorem, any non-identity element in a group of prime order p generates a subgroup of order > 1 dividing p, hence order p (cyclic ⇒ abelian). (B) From e ≤ 3v − 6, average degree 2e/v < 6, so min degree ≤ 5. (D) Exact statement of Lagrange\'s theorem.',
    wrongOptionAnalysis:
      'Option C flips odd/even! A graph is bipartite iff it contains no ODD-length cycles (e.g., C_4 is bipartite and has an even cycle).',
  },

  // ===================== DIGITAL LOGIC (4) =====================
  {
    id: 'q-dl-1',
    subjectId: 'dl',
    subtopic: 'Boolean Minimization · K-Map EPIs',
    format: 'NAT',
    marks: 2,
    difficulty: 'Hard',
    sourceTag: 'GO-Style Concept DPP',
    prompt:
      'Consider the 4-variable Boolean function f(A, B, C, D) = ∑m(1, 3, 7, 11, 15) + d(0, 2, 5), where d denotes don\'t-care conditions. How many Essential Prime Implicants (EPIs) does f have?',
    natAnswer: 1,
    natTolerance: 0,
    explanation:
      'Plot the 4-variable K-map: Prime implicants covering at least one mandatory 1 are CD = {3, 7, 11, 15}, A\'B\' = {0, 1, 2, 3}, and A\'D = {1, 3, 5, 7}. Minterms 11 and 15 are covered ONLY by CD, so CD is an EPI. Minterm 1 is covered by BOTH A\'B\' and A\'D, while 3 and 7 are already in CD. Don\'t-cares (0, 2, 5) never qualify an implicant as essential. Therefore, there is exactly 1 EPI.',
    wrongOptionAnalysis:
      'Answering 2 or 3 occurs when treating don\'t-care cells 0, 2, or 5 as mandatory minterms, mistakenly promoting A\'B\' or A\'D to EPIs.',
  },
  {
    id: 'q-dl-2',
    subjectId: 'dl',
    subtopic: 'Floating-Point · IEEE 754',
    format: 'MCQ',
    marks: 2,
    difficulty: 'Medium',
    sourceTag: 'PYQ Pattern · DL',
    prompt:
      'What decimal value is represented by the 32-bit IEEE 754 single-precision floating-point hexadecimal word 0xC1A00000?',
    options: [
      { id: 'A', text: '-10.0' },
      { id: 'B', text: '-20.0' },
      { id: 'C', text: '+20.0' },
      { id: 'D', text: '-24.0' },
    ],
    correctOption: 'B',
    explanation:
      '0xC1A00000 in binary starts with 1100 0001 1010 0000... Sign bit S = 1 (negative). Exponent E = 10000011_2 = 131 ⇒ unbiased exponent = 131 − 127 = 4. Mantissa M = 0100..._2 ⇒ 1.M = 1.01_2 = 1.25. Value = −1.25 × 2^4 = −20.0.',
    wrongOptionAnalysis:
      'Option A (-10.0) uses bias 128 instead of 127. Option C (+20.0) ignores sign bit S = 1. Option D (-24.0) misreads 1.01_2 as 1.5 instead of 1.25.',
  },
  {
    id: 'q-dl-3',
    subjectId: 'dl',
    subtopic: 'Sequential Circuits · Counters',
    format: 'NAT',
    marks: 1,
    difficulty: 'Easy',
    sourceTag: 'PYQ Pattern · DL',
    prompt:
      'A Mod-10 ripple counter is cascaded with a Mod-6 ripple counter. If a 120 kHz square-wave clock is applied to the input of the first counter, what is the output frequency (in kHz) at the MSB of the second counter?',
    natAnswer: 2,
    natTolerance: 0,
    natUnit: 'kHz',
    explanation:
      'Cascading a Mod-M counter and a Mod-N counter yields an overall Mod-(M × N) frequency divider. Here M × N = 10 × 6 = 60. Output frequency = 120 kHz / 60 = 2 kHz.',
    wrongOptionAnalysis:
      'Adding instead of multiplying moduli (120 / 16 = 7.5 kHz) is the classic trap when cascading sequential dividers.',
  },
  {
    id: 'q-dl-4',
    subjectId: 'dl',
    subtopic: 'Number Systems & Combinational Logic',
    format: 'MSQ',
    marks: 2,
    difficulty: 'Medium',
    sourceTag: 'GO-Style Concept DPP',
    prompt: 'Which of the following statements about digital circuits and signed arithmetic are TRUE?',
    options: [
      { id: 'A', text: 'In 2\'s complement addition, overflow occurs iff the carry-in to the MSB differs from the carry-out of the MSB.' },
      { id: 'B', text: 'A 2:1 multiplexer with constants 0 and 1 available is functionally complete (universal).' },
      { id: 'C', text: 'Adding two numbers of opposite signs in 2\'s complement representation can cause arithmetic overflow.' },
      { id: 'D', text: 'An n-bit 2\'s complement system represents integers in the range [−2^(n−1), 2^(n−1) − 1].' },
    ],
    correctOptions: ['A', 'B', 'D'],
    explanation:
      '(A) Standard hardware overflow flag V = C_in(MSB) ⊕ C_out(MSB). (B) A 2:1 MUX implements NOT (I0=1, I1=0, S=A) and AND (I0=0, I1=B, S=A), forming a universal set. (D) Exact 2\'s complement asymmetric range.',
    wrongOptionAnalysis:
      'Option C is FALSE: adding a positive and a negative number always brings the magnitude closer to zero, so it can NEVER overflow the representable range.',
  },

  // ===================== COA (4) =====================
  {
    id: 'q-coa-1',
    subjectId: 'coa',
    subtopic: 'Memory Hierarchy · Cache Mapping',
    format: 'NAT',
    marks: 2,
    difficulty: 'Medium',
    sourceTag: 'PYQ Pattern · COA',
    prompt:
      'A byte-addressable system has a 32-bit physical address space and a 64 KB 4-way set-associative cache with a block size of 64 bytes. How many bits are required for the TAG field of each cache block?',
    natAnswer: 18,
    natTolerance: 0,
    natUnit: 'bits',
    explanation:
      'Block Offset = log2(64) = 6 bits. Total cache lines = 64 KB / 64 B = 1024 lines. Number of sets = 1024 / 4 = 256 sets ⇒ Set Index = log2(256) = 8 bits. Tag bits = 32 − 8 − 6 = 18 bits.',
    wrongOptionAnalysis:
      'Forgetting to divide total blocks by associativity (4) gives 10 index bits and wrong tag = 16 bits.',
  },
  {
    id: 'q-coa-2',
    subjectId: 'coa',
    subtopic: 'Pipelining · Hazards & Forwarding',
    format: 'MCQ',
    marks: 2,
    difficulty: 'Hard',
    sourceTag: 'PYQ Pattern · COA',
    prompt:
      'Consider a standard 5-stage RISC pipeline (IF, ID, EX, MEM, WB) with full operand forwarding (EX/MEM → EX and MEM/WB → EX) and register write-before-read in the same cycle. How many clock cycles are required to complete the following 4-instruction sequence?',
    codeSnippet: `I1: LW  R1, 0(R2)
I2: ADD R3, R1, R4
I3: SUB R5, R3, R6
I4: AND R7, R5, R1`,
    options: [
      { id: 'A', text: '8' },
      { id: 'B', text: '9' },
      { id: 'C', text: '10' },
      { id: 'D', text: '11' },
    ],
    correctOption: 'B',
    explanation:
      'Ideal cycles for 4 instructions in a 5-stage pipeline = 5 + 4 − 1 = 8. I1 (LW) produces R1 at the end of MEM (cycle 4), whereas I2 (ADD) needs R1 at EX (originally cycle 4). Even with full forwarding, this load-use hazard forces 1 stall cycle, shifting I2\'s EX to cycle 5. I3 gets R3 via EX→EX forwarding (0 stalls), and I4 gets R5 via EX→EX forwarding while R1 is already written back in cycle 5. Total cycles = 8 + 1 = 9.',
    wrongOptionAnalysis:
      'Option A (8) assumes forwarding eliminates load-use hazards—impossible because memory data isn\'t available until after MEM. Option C (10) inserts an unnecessary stall between I2 and I3.',
  },
  {
    id: 'q-coa-3',
    subjectId: 'coa',
    subtopic: 'Memory Hierarchy · AMAT',
    format: 'NAT',
    marks: 2,
    difficulty: 'Medium',
    sourceTag: 'GO-Style Concept DPP',
    prompt:
      'A two-level hierarchical cache system has an L1 cache with 90% hit rate and 2 ns access time, an L2 cache with 80% local hit rate and 10 ns access time, and Main Memory with 100 ns access time. Assuming strictly sequential (hierarchical) lookup on misses, what is the Average Memory Access Time (AMAT) in nanoseconds?',
    natAnswer: 5,
    natTolerance: 0.01,
    natUnit: 'ns',
    explanation:
      'AMAT = T_L1 + (1 − H_L1) × [T_L2 + (1 − H_L2) × T_MM] = 2 + 0.10 × [10 + 0.20 × 100] = 2 + 0.10 × [10 + 20] = 2 + 3 = 5 ns.',
    wrongOptionAnalysis:
      'Multiplying T_L1 by H_L1 (0.9 × 2) instead of paying T_L1 on every access yields 4.8 ns—wrong because L1 is always probed first.',
  },
  {
    id: 'q-coa-4',
    subjectId: 'coa',
    subtopic: 'Cache Policies & I/O DMA',
    format: 'MSQ',
    marks: 2,
    difficulty: 'Medium',
    sourceTag: 'GO-Style Concept DPP',
    prompt: 'Which of the following statements regarding COA memory and I/O mechanisms are TRUE?',
    options: [
      { id: 'A', text: 'A write-back cache requires a dirty bit per cache line to avoid unnecessary writes to main memory on eviction.' },
      { id: 'B', text: 'In DMA Cycle Stealing mode, the CPU is completely halted for the entire duration of a multi-kilobyte block transfer.' },
      { id: 'C', text: 'Increasing cache associativity while keeping total cache size and block size constant reduces conflict misses.' },
      { id: 'D', text: 'Warm-up (compulsory) misses cannot be eliminated solely by increasing cache size while keeping block size fixed.' },
    ],
    correctOptions: ['A', 'C', 'D'],
    explanation:
      '(A) Dirty bit tracks modified blocks in write-back caches. (C) Higher associativity gives more candidate frames per set, directly reducing conflict misses. (D) First-ever access to a block always misses regardless of total cache capacity.',
    wrongOptionAnalysis:
      'Option B describes DMA Burst Mode, NOT Cycle Stealing! In Cycle Stealing, the DMA controller takes only one bus cycle per word transfer and yields the bus back to the CPU.',
  },

  // ===================== PROGRAMMING & DATA STRUCTURES (4) =====================
  {
    id: 'q-pds-1',
    subjectId: 'pds',
    subtopic: 'C Programming · Double Pointers',
    format: 'MCQ',
    marks: 2,
    difficulty: 'Medium',
    sourceTag: 'PYQ Pattern · PDS',
    prompt: 'What is the output of the following C program?',
    codeSnippet: `#include <stdio.h>
int main(void) {
    int a[] = {10, 20, 30, 40, 50};
    int *p[] = {a, a + 3, a + 4, a + 1, a + 2};
    int **ptr = p;
    ptr++;
    printf("%d %d\\n", (int)(ptr - p), **ptr);
    return 0;
}`,
    options: [
      { id: 'A', text: '1 20' },
      { id: 'B', text: '1 40' },
      { id: 'C', text: '4 40' },
      { id: 'D', text: '3 40' },
    ],
    correctOption: 'B',
    explanation:
      'ptr initially points to &p[0]. After ptr++, ptr points to &p[1]. Pointer subtraction (ptr − p) yields element distance = 1 (not byte offset!). *ptr evaluates to p[1] = a + 3, so **ptr = *(a + 3) = a[3] = 40. Output: 1 40.',
    wrongOptionAnalysis:
      'Option A assumes p[1] = a + 1. Option C confuses pointer subtraction with raw byte difference (sizeof(int*) bytes). Option D computes (*ptr − a) instead of (ptr − p).',
  },
  {
    id: 'q-pds-2',
    subjectId: 'pds',
    subtopic: 'C Programming · Recursion & Static Storage',
    format: 'NAT',
    marks: 2,
    difficulty: 'Hard',
    sourceTag: 'PYQ Pattern · PDS',
    prompt: 'What integer value is returned by calling f(5) in the following C function?',
    codeSnippet: `int f(int n) {
    static int r = 0;
    if (n <= 0) return 1;
    if (n > 3) {
        r = n;
        return f(n - 2) + 2;
    }
    return f(n - 1) + r;
}`,
    natAnswer: 18,
    natTolerance: 0,
    explanation:
      'Because r is static, all recursive frames share ONE copy of r. f(5): n=5>3 ⇒ sets r = 5, returns f(3) + 2. f(3) ⇒ f(2) + r; f(2) ⇒ f(1) + r; f(1) ⇒ f(0) + r; f(0) = 1. Unwinding with r = 5: f(1) = 1 + 5 = 6, f(2) = 6 + 5 = 11, f(3) = 11 + 5 = 16, f(5) = 16 + 2 = 18.',
    wrongOptionAnalysis:
      'Treating r as a local variable (0 in frames n=3,2,1) gives 1 + 2 = 3. Adding +2 at every frame instead of only n=5 gives 24.',
  },
  {
    id: 'q-pds-3',
    subjectId: 'pds',
    subtopic: 'Trees · BST Counting',
    format: 'NAT',
    marks: 1,
    difficulty: 'Easy',
    sourceTag: 'PYQ Pattern · PDS',
    prompt:
      'How many structurally distinct Binary Search Trees (BSTs) can be formed using the 4 distinct keys {10, 20, 30, 40}?',
    natAnswer: 14,
    natTolerance: 0,
    explanation:
      'The number of structurally distinct BSTs on n distinct keys is the nth Catalan number C_n = C(2n, n) / (n + 1). For n = 4: C_4 = C(8, 4) / 5 = 70 / 5 = 14.',
    wrongOptionAnalysis:
      'Answering 24 (= 4!) counts insertion permutations, ignoring that multiple insertion orders (e.g., 20,10,30,40 and 20,30,10,40) build the exact same BST.',
  },
  {
    id: 'q-pds-4',
    subjectId: 'pds',
    subtopic: 'Heaps & Balanced Trees',
    format: 'MSQ',
    marks: 2,
    difficulty: 'Medium',
    sourceTag: 'GO-Style Concept DPP',
    prompt: 'Which of the following statements about Binary Heaps and AVL Trees are TRUE?',
    options: [
      { id: 'A', text: 'In a max-heap of n distinct elements, the minimum element must reside at a leaf node.' },
      { id: 'B', text: 'Deleting the maximum element from an n-element max-heap takes O(log n) worst-case time.' },
      { id: 'C', text: 'Finding the minimum element in an n-element max-heap takes O(log n) worst-case time.' },
      { id: 'D', text: 'An AVL tree with n nodes always has height O(log n), even under sorted insertions.' },
    ],
    correctOptions: ['A', 'B', 'D'],
    explanation:
      '(A) Any internal node is larger than its children, so the global minimum cannot have children and must be a leaf. (B) Swap root with last element and sift-down takes O(log n). (D) AVL balance factor ∈ {−1, 0, +1} guarantees h < 1.44 log2(n + 2).',
    wrongOptionAnalysis:
      'Option C is FALSE: there are ⌈n/2⌉ leaves in a max-heap with no relative ordering among them, so finding the minimum requires Ω(n) linear scan of all leaves.',
  },

  // ===================== ALGORITHMS (4) =====================
  {
    id: 'q-algo-1',
    subjectId: 'algo',
    subtopic: 'Recurrences · Extended Master Theorem',
    format: 'MCQ',
    marks: 2,
    difficulty: 'Hard',
    sourceTag: 'GO-Style Concept DPP',
    prompt: 'What is the tight asymptotic solution to the recurrence T(n) = 2T(n/2) + n / log n?',
    options: [
      { id: 'A', text: 'Θ(n)' },
      { id: 'B', text: 'Θ(n log log n)' },
      { id: 'C', text: 'Θ(n log n)' },
      { id: 'D', text: 'Θ(n / log n)' },
    ],
    correctOption: 'B',
    explanation:
      'Here a = 2, b = 2 ⇒ n^(log_b a) = n. f(n) = n · (log n)^(−1) fits Extended Master Theorem Case 2 with k = −1. Summing across recursion tree levels gives n · ∑_{i=1}^{log n} (1/i) = n · H_(log n) = Θ(n log log n).',
    wrongOptionAnalysis:
      'Option A wrongly applies standard Master Theorem Case 1—n / log n is NOT polynomially smaller than n (not O(n^(1−ε)) for any ε > 0).',
  },
  {
    id: 'q-algo-2',
    subjectId: 'algo',
    subtopic: 'Dynamic Programming · Matrix Chain Multiplication',
    format: 'NAT',
    marks: 2,
    difficulty: 'Medium',
    sourceTag: 'PYQ Pattern · ALGO',
    prompt:
      'Three matrices A1, A2, A3 have dimensions 10×30, 30×5, and 5×60 respectively. What is the minimum number of scalar multiplications needed to compute the product A1 · A2 · A3?',
    natAnswer: 4500,
    natTolerance: 0,
    explanation:
      'Parenthesization 1: (A1 · A2) · A3 costs (10 × 30 × 5) + (10 × 5 × 60) = 1500 + 3000 = 4500. Parenthesization 2: A1 · (A2 · A3) costs (30 × 5 × 60) + (10 × 30 × 60) = 9000 + 18000 = 27000. Minimum is 4500.',
    wrongOptionAnalysis:
      'Multiplying right-to-left gives 27000 (6× slower!). Another slip is adding 1500 + 9000 instead of using the resulting 10×5 matrix dimension.',
  },
  {
    id: 'q-algo-3',
    subjectId: 'algo',
    subtopic: 'Graph Algorithms · MST & Shortest Paths',
    format: 'MSQ',
    marks: 2,
    difficulty: 'Hard',
    sourceTag: 'GO-Style Concept DPP',
    prompt:
      'Consider a connected undirected weighted graph G = (V, E) with strictly positive edge weights. Which of the following statements are ALWAYS true?',
    options: [
      { id: 'A', text: 'If every edge weight is increased by a positive constant c, the set of Minimum Spanning Trees of G remains unchanged.' },
      { id: 'B', text: 'If every edge weight is increased by a positive constant c, the shortest path between any pair (u, v) remains unchanged.' },
      { id: 'C', text: 'If all edge weights are distinct, G has a unique Minimum Spanning Tree.' },
      { id: 'D', text: 'If G has a unique Minimum Spanning Tree, then all edge weights in G must be distinct.' },
    ],
    correctOptions: ['A', 'C'],
    explanation:
      '(A) Every spanning tree has exactly |V| − 1 edges, so adding c to each edge increases every spanning tree\'s weight by the identical constant c(|V| − 1), preserving the MST ordering. (C) Classic Cut Property proof guarantees uniqueness when weights are distinct.',
    wrongOptionAnalysis:
      'Option B fails: a 1-edge path of weight 5 vs a 2-edge path of weights 2+2=4; adding c=2 makes them 7 vs 8, flipping the shortest path! Option D is the classic converse trap: a triangle with weights (1, 2, 2) has a non-unique MST, whereas (1, 1, 5) has a UNIQUE MST {1, 1} despite duplicate weights!',
  },
  {
    id: 'q-algo-4',
    subjectId: 'algo',
    subtopic: 'Sorting & Complexity',
    format: 'MCQ',
    marks: 1,
    difficulty: 'Easy',
    sourceTag: 'PYQ Pattern · ALGO',
    prompt:
      'What is the tight worst-case time complexity of building a binary max-heap from an unsorted array of n elements using bottom-up Floyd\'s Build-Heap algorithm?',
    options: [
      { id: 'A', text: 'Θ(log n)' },
      { id: 'B', text: 'Θ(n)' },
      { id: 'C', text: 'Θ(n log n)' },
      { id: 'D', text: 'Θ(n^2)' },
    ],
    correctOption: 'B',
    explanation:
      'At height h from the bottom, at most ⌈n / 2^(h+1)⌉ nodes each perform at most O(h) work. Total work ≤ n · ∑_{h=0}^{∞} h / 2^(h+1) = n · 1 = O(n), and touching every element requires Ω(n), giving Θ(n).',
    wrongOptionAnalysis:
      'Option C (Θ(n log n)) is the loose upper bound (n calls × O(log n) max heapify) or the cost of top-down repeated insertion.',
  },

  // ===================== THEORY OF COMPUTATION (4) =====================
  {
    id: 'q-toc-1',
    subjectId: 'toc',
    subtopic: 'Finite Automata · Myhill-Nerode',
    format: 'NAT',
    marks: 2,
    difficulty: 'Medium',
    sourceTag: 'PYQ Pattern · TOC',
    prompt:
      'What is the minimum number of states in a Deterministic Finite Automaton (DFA) over Σ = {0, 1} that accepts all binary strings whose decimal value is divisible by 5 (assuming ε evaluates to 0 and leading zeros are permitted)?',
    natAnswer: 5,
    natTolerance: 0,
    natUnit: 'states',
    explanation:
      'Track the current value modulo 5: states q0, q1, q2, q3, q4 with δ(q_r, b) = q_{(2r + b) mod 5}, start/accept state q0. By Myhill-Nerode, strings representing remainders 0, 1, 2, 3, 4 are pairwise distinguishable (appending appropriate suffixes moves one to 0 mod 5 and not the other), proving 5 states are necessary and sufficient.',
    wrongOptionAnalysis:
      'Adding a separate start state to exclude ε would yield 6 states, but the prompt explicitly notes ε evaluates to 0.',
  },
  {
    id: 'q-toc-2',
    subjectId: 'toc',
    subtopic: 'Closure & Decidability Properties',
    format: 'MSQ',
    marks: 2,
    difficulty: 'Hard',
    sourceTag: 'GO-Style Concept DPP',
    prompt: 'Which of the following statements are TRUE?',
    options: [
      { id: 'A', text: 'Deterministic Context-Free Languages (DCFLs) are closed under complementation.' },
      { id: 'B', text: 'The intersection of a Context-Free Language and a Regular Language is always Context-Free.' },
      { id: 'C', text: 'Determining whether two given Context-Free Grammars generate the same language is decidable.' },
      { id: 'D', text: 'Determining whether the language generated by a given Context-Free Grammar is empty is decidable.' },
    ],
    correctOptions: ['A', 'B', 'D'],
    explanation:
      '(A) Convert any DPDA to a halting complete DPDA and swap final/non-final states ⇒ DCFL closed under complement. (B) Product construction between PDA and DFA yields a PDA ⇒ CFL ∩ REG = CFL. (D) Emptiness of CFG is decidable in polynomial time by marking generating non-terminals bottom-up.',
    wrongOptionAnalysis:
      'Option C is FALSE: Equivalence of CFGs (L(G1) = L(G2)) is UNDECIDABLE (even universality L(G) = Σ* is undecidable for CFGs).',
  },
  {
    id: 'q-toc-3',
    subjectId: 'toc',
    subtopic: 'Undecidability · Rice Theorem',
    format: 'MCQ',
    marks: 2,
    difficulty: 'Hard',
    sourceTag: 'PYQ Pattern · TOC',
    prompt: 'Which of the following decision problems about an arbitrary Turing Machine M is DECIDABLE?',
    options: [
      { id: 'A', text: 'Does M accept a regular language?' },
      { id: 'B', text: 'Does M have at most 50 states in its finite control?' },
      { id: 'C', text: 'Is L(M) finite?' },
      { id: 'D', text: 'Does M halt on the empty string ε?' },
    ],
    correctOption: 'B',
    explanation:
      'Counting the states in the finite description ⟨M⟩ is a purely syntactic inspection that finishes in linear time — hence DECIDABLE! Options A, C, and D are non-trivial semantic properties of L(M) (or halting behavior) and are undecidable by Rice\'s Theorem / reduction from HALT_TM.',
    wrongOptionAnalysis:
      'Students blindly apply Rice\'s Theorem to Option B, forgetting that Rice\'s Theorem applies ONLY to semantic properties of the language L(M), never syntactic properties of the machine description M.',
  },
  {
    id: 'q-toc-4',
    subjectId: 'toc',
    subtopic: 'Chomsky Hierarchy · Pumping Lemma',
    format: 'MCQ',
    marks: 1,
    difficulty: 'Medium',
    sourceTag: 'PYQ Pattern · TOC',
    prompt:
      'The language L = { a^n b^m c^n d^m | n ≥ 1, m ≥ 1 } over Σ = {a, b, c, d} is:',
    options: [
      { id: 'A', text: 'Regular' },
      { id: 'B', text: 'Deterministic Context-Free but not Regular' },
      { id: 'C', text: 'Context-Free but not Deterministic Context-Free' },
      { id: 'D', text: 'Recursive (Decidable) but not Context-Free' },
    ],
    correctOption: 'D',
    explanation:
      'L exhibits crossing dependencies (a^n matches c^n across b^m, and b^m matches d^m across c^n), which a single LIFO stack cannot verify—easily proven non-CFL by the CFL Pumping Lemma. A linear-bounded automaton / Turing Machine easily decides L, making it Context-Sensitive and Recursive.',
    wrongOptionAnalysis:
      'Option C confuses crossing dependencies {a^n b^m c^n d^m} with nested dependencies {a^n b^m c^m d^n}, which IS a DCFL.',
  },

  // ===================== COMPILER DESIGN (3) =====================
  {
    id: 'q-cd-1',
    subjectId: 'cd',
    subtopic: 'Parsing · LL & LR Hierarchy',
    format: 'MSQ',
    marks: 2,
    difficulty: 'Hard',
    sourceTag: 'GO-Style Concept DPP',
    prompt: 'Which of the following statements about top-down and bottom-up parsers are TRUE?',
    options: [
      { id: 'A', text: 'Every LL(1) grammar is unambiguous.' },
      { id: 'B', text: 'Merging CLR(1) states with identical LR(0) cores to build LALR(1) can introduce Reduce-Reduce conflicts, but NEVER new Shift-Reduce conflicts.' },
      { id: 'C', text: 'Every SLR(1) grammar is an LL(1) grammar.' },
      { id: 'D', text: 'LR(0) ⊂ SLR(1) ⊂ LALR(1) ⊂ CLR(1).' },
    ],
    correctOptions: ['A', 'B', 'D'],
    explanation:
      '(A) Any ambiguous grammar has two leftmost derivations, forcing a collision in the LL(1) table. (B) Shift actions depend only on the core items (which are identical in merged states), so no new SR conflict can appear; only lookahead unions on reduce items can collide (RR). (D) Standard strict LR hierarchy.',
    wrongOptionAnalysis:
      'Option C is FALSE: Left-recursive grammars (e.g., E → E + T | T) are SLR(1) (even LR(0)/SLR(1)) yet NEVER LL(1).',
  },
  {
    id: 'q-cd-2',
    subjectId: 'cd',
    subtopic: 'Intermediate Code · Basic Blocks',
    format: 'NAT',
    marks: 2,
    difficulty: 'Medium',
    sourceTag: 'PYQ Pattern · CD',
    prompt:
      'How many Basic Blocks are present in the following Three-Address Code (TAC) sequence?',
    codeSnippet: `1: i = 1
2: sum = 0
3: if i > 10 goto 8
4: t1 = sum + i
5: sum = t1
6: i = i + 1
7: goto 3
8: return sum`,
    natAnswer: 4,
    natTolerance: 0,
    natUnit: 'blocks',
    explanation:
      'Identify leaders using the 3 textbook rules: (1) First instruction → Line 1. (2) Target of any jump → Line 3 (target of line 7) and Line 8 (target of line 3). (3) Instruction immediately following a jump → Line 4 (follows line 3) and Line 8 (follows line 7). Distinct leaders = {1, 3, 4, 8} ⇒ 4 Basic Blocks: [1–2], [3], [4–7], [8].',
    wrongOptionAnalysis:
      'Answering 3 forgets that Line 3 is a jump target of Line 7, so [1–3] must split into [1–2] and [3].',
  },
  {
    id: 'q-cd-3',
    subjectId: 'cd',
    subtopic: 'Optimization · Data Flow Analysis',
    format: 'MCQ',
    marks: 2,
    difficulty: 'Medium',
    sourceTag: 'PYQ Pattern · CD',
    prompt:
      'In classical compiler data-flow analysis, Live Variable Analysis and Available Expressions Analysis are characterized respectively by:',
    options: [
      { id: 'A', text: 'Forward / Union  and  Backward / Intersection' },
      { id: 'B', text: 'Backward / Union  and  Forward / Intersection' },
      { id: 'C', text: 'Backward / Intersection  and  Forward / Union' },
      { id: 'D', text: 'Forward / Intersection  and  Backward / Union' },
    ],
    correctOption: 'B',
    explanation:
      'A variable is live at point p if there EXISTS SOME future path using it before redefinition ⇒ Backward + Union (May analysis). An expression is available at point p if it is computed along ALL paths reaching p without operands being redefined ⇒ Forward + Intersection (Must analysis).',
    wrongOptionAnalysis:
      'Option C swaps May (Union) vs Must (Intersection). Option A swaps Forward vs Backward directions.',
  },

  // ===================== OPERATING SYSTEMS (4) =====================
  {
    id: 'q-os-1',
    subjectId: 'os',
    subtopic: 'Virtual Memory · TLB & EMAT',
    format: 'NAT',
    marks: 2,
    difficulty: 'Easy',
    sourceTag: 'PYQ Pattern · OS',
    prompt:
      'A paged virtual memory system uses a single-level page table stored in main memory. The TLB access time is 10 ns, main memory access time is 100 ns, and the TLB hit ratio is 80%. Assuming zero page faults and sequential TLB-then-memory lookup, what is the Effective Memory Access Time (in ns)?',
    natAnswer: 130,
    natTolerance: 0.1,
    natUnit: 'ns',
    explanation:
      'On a TLB hit (80%), access takes TLB + Data = 10 + 100 = 110 ns. On a TLB miss (20%), access takes TLB + Page Table + Data = 10 + 100 + 100 = 210 ns. EMAT = 0.8 × 110 + 0.2 × 210 = 88 + 42 = 130 ns.',
    wrongOptionAnalysis:
      'Adding an extra TLB lookup on miss yields 132 ns; forgetting TLB time on misses yields 128 ns.',
  },
  {
    id: 'q-os-2',
    subjectId: 'os',
    subtopic: 'Processes · fork() System Call',
    format: 'MCQ',
    marks: 2,
    difficulty: 'Medium',
    sourceTag: 'PYQ Pattern · OS',
    prompt:
      'Assuming all fork() system calls succeed, how many times is the character \'G\' printed by the following C code fragment?',
    codeSnippet: `if (fork() && fork()) {
    fork();
}
printf("G");`,
    options: [
      { id: 'A', text: '3' },
      { id: 'B', text: '4' },
      { id: 'C', text: '6' },
      { id: 'D', text: '8' },
    ],
    correctOption: 'B',
    explanation:
      'Process P0 runs 1st fork() → creates C1 (returns 0, short-circuits &&, exits if, prints G). P0 (returns >0) runs 2nd fork() → creates C2 (returns 0, exits if, prints G). P0 (returns >0) enters the if-block and runs 3rd fork() → creates C3; both P0 and C3 print G. Total processes printing G = {P0, C1, C2, C3} = 4.',
    wrongOptionAnalysis:
      'Option D (8 = 2^3) blindly applies 2^n without tracing C short-circuiting on &&! Option A (3) counts only the newly created children instead of total processes.',
  },
  {
    id: 'q-os-3',
    subjectId: 'os',
    subtopic: 'Deadlock · Resource Allocation',
    format: 'NAT',
    marks: 1,
    difficulty: 'Easy',
    sourceTag: 'PYQ Pattern · OS',
    prompt:
      'A system has 4 processes sharing identical instances of a single resource type R. Each process requires a maximum of 3 instances of R to complete. What is the minimum number of instances of R required to guarantee that the system can NEVER enter a deadlock?',
    natAnswer: 9,
    natTolerance: 0,
    natUnit: 'instances',
    explanation:
      'Worst-case deadlock holds (Max_i − 1) = 2 instances per process, totaling 4 × 2 = 8 instances with none able to finish. Adding 1 extra instance ensures at least one process reaches 3 instances, completes, and releases all 3. Thus R_min = 8 + 1 = 9.',
    wrongOptionAnalysis:
      'Answering 12 (= 4 × 3) is sufficient but not MINIMUM; answering 8 allows all 4 processes to hold 2 each and deadlock permanently.',
  },
  {
    id: 'q-os-4',
    subjectId: 'os',
    subtopic: 'Scheduling & Page Replacement',
    format: 'MSQ',
    marks: 2,
    difficulty: 'Medium',
    sourceTag: 'GO-Style Concept DPP',
    prompt: 'Which of the following statements about Operating Systems are TRUE?',
    options: [
      { id: 'A', text: 'Among all scheduling algorithms, Shortest Remaining Time First (SRTF) achieves the minimum average waiting time.' },
      { id: 'B', text: 'LRU and Optimal page replacement algorithms satisfy the stack property and therefore never suffer from Belady\'s Anomaly.' },
      { id: 'C', text: 'FIFO page replacement never suffers from Belady\'s Anomaly.' },
      { id: 'D', text: 'Threads belonging to the same process share the heap and global variables, but each thread has its own stack and register set.' },
    ],
    correctOptions: ['A', 'B', 'D'],
    explanation:
      '(A) Proven optimal for average waiting/turnaround time (ignoring context switch overhead). (B) Stack algorithms guarantee pages(k) ⊆ pages(k+1), ruling out Belady\'s Anomaly. (D) Standard POSIX/OS thread memory layout.',
    wrongOptionAnalysis:
      'Option C is FALSE: FIFO is the canonical algorithm exhibiting Belady\'s Anomaly (e.g., reference string 1,2,3,4,1,2,5,1,2,3,4,5 has 9 faults at 3 frames and 10 faults at 4 frames).',
  },

  // ===================== DBMS (4) =====================
  {
    id: 'q-dbms-1',
    subjectId: 'dbms',
    subtopic: 'Indexing · B+ Tree Order',
    format: 'NAT',
    marks: 2,
    difficulty: 'Medium',
    sourceTag: 'PYQ Pattern · DBMS',
    prompt:
      'A B+ tree index is built on a search key of size 12 bytes. Disk block size is 1024 bytes, and a block pointer occupies 8 bytes. What is the maximum order (maximum number of block pointers) p of an INTERNAL node in this B+ tree?',
    natAnswer: 51,
    natTolerance: 0,
    explanation:
      'An internal node of order p stores p block pointers and (p − 1) search keys. Constraint: p × 8 + (p − 1) × 12 ≤ 1024 ⇒ 20p − 12 ≤ 1024 ⇒ 20p ≤ 1036 ⇒ p ≤ 51.8 ⇒ max integer p = 51.',
    wrongOptionAnalysis:
      'Using p keys instead of (p−1) keys gives 20p ≤ 1024 ⇒ p = 51 by luck here, but fails whenever K > B mod (P+K). Confusing internal nodes with leaf nodes (which include record pointers) yields wrong answers.',
  },
  {
    id: 'q-dbms-2',
    subjectId: 'dbms',
    subtopic: 'Normalization · 3NF vs BCNF',
    format: 'MCQ',
    marks: 2,
    difficulty: 'Medium',
    sourceTag: 'PYQ Pattern · DBMS',
    prompt:
      'Consider relation R(A, B, C, D) with functional dependencies F = { AB → C, C → D, D → A }. What is the highest normal form satisfied by R?',
    options: [
      { id: 'A', text: '1NF only' },
      { id: 'B', text: '2NF only' },
      { id: 'C', text: '3NF (not BCNF)' },
      { id: 'D', text: 'BCNF' },
    ],
    correctOption: 'C',
    explanation:
      'B never appears on any RHS, so B must be in every candidate key. Closures: (AB)+ = ABCD, (BC)+ = BCDA, (BD)+ = BDAC ⇒ Candidate Keys = {AB, BC, BD}. Every attribute {A, B, C, D} is PRIME! Because every RHS is prime, R satisfies 3NF. However, in C → D, C is NOT a superkey (C+ = CDA), violating BCNF. Hence highest normal form is 3NF.',
    wrongOptionAnalysis:
      'Option B misses that C and D are prime attributes (part of keys BC and BD), wrongly flagging C → D as a transitive dependency violation of 3NF. Option D forgets to check whether LHS is a superkey for BCNF.',
  },
  {
    id: 'q-dbms-3',
    subjectId: 'dbms',
    subtopic: 'Transactions · Serializability & 2PL',
    format: 'MSQ',
    marks: 2,
    difficulty: 'Hard',
    sourceTag: 'GO-Style Concept DPP',
    prompt: 'Which of the following statements about database concurrency control are TRUE?',
    options: [
      { id: 'A', text: 'Every conflict-serializable schedule is also view-serializable.' },
      { id: 'B', text: 'Strict Two-Phase Locking (Strict 2PL) guarantees both conflict-serializability and cascadeless (strict) schedules.' },
      { id: 'C', text: 'Basic Two-Phase Locking (2PL) is guaranteed to be deadlock-free.' },
      { id: 'D', text: 'Every cascadeless schedule is recoverable.' },
    ],
    correctOptions: ['A', 'B', 'D'],
    explanation:
      '(A) Conflict-serializable ⊂ View-serializable (blind writes separate them). (B) Holding all exclusive locks until commit/abort prevents dirty reads & dirty writes (strict ⇒ cascadeless) and follows 2PL (conflict-serializable). (D) Hierarchy: Strict ⊂ Cascadeless ⊂ Recoverable.',
    wrongOptionAnalysis:
      'Option C is FALSE: 2PL (even Strict 2PL) CAN suffer from deadlocks when two transactions wait cyclically for each other\'s locks.',
  },
  {
    id: 'q-dbms-4',
    subjectId: 'dbms',
    subtopic: 'SQL · NULL & Three-Valued Logic',
    format: 'MCQ',
    marks: 1,
    difficulty: 'Medium',
    sourceTag: 'PYQ Pattern · DBMS',
    prompt:
      'Table T1(x) contains rows {1, 2, 3}. Table T2(y) contains rows {2, NULL}. How many rows are returned by: SELECT x FROM T1 WHERE x NOT IN (SELECT y FROM T2);',
    options: [
      { id: 'A', text: '0' },
      { id: 'B', text: '1' },
      { id: 'C', text: '2' },
      { id: 'D', text: '3' },
    ],
    correctOption: 'A',
    explanation:
      'x NOT IN (2, NULL) expands to (x <> 2 AND x <> NULL). In SQL three-valued logic, any comparison with NULL yields UNKNOWN. Since (TRUE AND UNKNOWN) = UNKNOWN and (FALSE AND UNKNOWN) = FALSE, no row ever evaluates to TRUE. Result: 0 rows.',
    wrongOptionAnalysis:
      'Option C (2 rows: {1, 3}) assumes NULL is ignored by NOT IN—it is NOT! Only NOT EXISTS handles NULL safely in anti-joins.',
  },

  // ===================== COMPUTER NETWORKS (3 — GATE 2027 ALIGNED) =====================
  {
    id: 'q-cn-1',
    subjectId: 'cn',
    subtopic: 'Network Layer · IPv4 Fragmentation',
    format: 'NAT',
    marks: 2,
    difficulty: 'Medium',
    sourceTag: 'PYQ Pattern · CN',
    prompt:
      'A 4000-byte IPv4 datagram (including a 20-byte IP header) must traverse a link with MTU = 1500 bytes. What is the value of the Fragment Offset field (in 8-byte units) in the header of the 3rd (last) fragment?',
    natAnswer: 370,
    natTolerance: 0,
    explanation:
      'Original payload = 4000 − 20 = 3980 bytes. Max payload per fragment = ⌊(1500 − 20) / 8⌋ × 8 = 1480 bytes. Frag 1 carries bytes [0..1479] (Offset = 0, MF = 1). Frag 2 carries bytes [1480..2959] (Offset = 1480/8 = 185, MF = 1). Frag 3 carries bytes [2960..3979] (1020 bytes, Offset = 2960/8 = 370, MF = 0).',
    wrongOptionAnalysis:
      'Forgetting to divide by 8 gives 2960; forgetting to subtract the 20-byte header from MTU gives 1500 (not even divisible by 8).',
  },
  {
    id: 'q-cn-2',
    subjectId: 'cn',
    subtopic: 'Transport Layer · TCP Reno Congestion Control',
    format: 'NAT',
    marks: 2,
    difficulty: 'Hard',
    sourceTag: 'GO-Style Concept DPP',
    prompt:
      'A TCP Reno sender has MSS = 1 KB and an initial ssthresh = 16 KB. During transmission, a 3-Duplicate-ACK event occurs when cwnd = 16 KB (and no timeout occurs). Assuming unlimited receiver window and no further packet loss, what is the value of cwnd (in KB) exactly 3 RTTs after Fast Recovery completes?',
    natAnswer: 11,
    natTolerance: 0,
    natUnit: 'KB',
    explanation:
      'On 3-Duplicate-ACK in TCP Reno: ssthresh is set to cwnd / 2 = 8 KB, and cwnd is set to ssthresh = 8 KB (entering Congestion Avoidance, NOT Slow Start). In Congestion Avoidance, cwnd increases linearly by +1 MSS (1 KB) per RTT. After 3 RTTs: cwnd = 8 + 3 = 11 KB.',
    wrongOptionAnalysis:
      'Resetting cwnd to 1 KB (TCP Tahoe / Timeout behavior) leads to Slow Start (1 → 2 → 4 → 8 KB). Doubling from 8 KB forgets that cwnd ≥ ssthresh enters linear Congestion Avoidance.',
  },
  {
    id: 'q-cn-3',
    subjectId: 'cn',
    subtopic: 'Data Link & Routing · Sliding Window & CIDR',
    format: 'MSQ',
    marks: 2,
    difficulty: 'Medium',
    sourceTag: 'GO-Style Concept DPP',
    prompt: 'Which of the following statements about Computer Networks (GATE 2027 Syllabus) are TRUE?',
    options: [
      { id: 'A', text: 'In Selective Repeat ARQ with k-bit sequence numbers, the maximum sender window size (when W_s = W_r) is 2^(k−1).' },
      { id: 'B', text: 'In Go-Back-N ARQ with k-bit sequence numbers, the maximum sender window size is 2^k − 1.' },
      { id: 'C', text: 'In CIDR routing tables, if multiple prefixes match a destination IP, the router selects the entry with the shortest prefix length.' },
      { id: 'D', text: 'In CSMA/CD Ethernet, minimum frame transmission time must be at least 2 × propagation delay to guarantee collision detection.' },
    ],
    correctOptions: ['A', 'B', 'D'],
    explanation:
      '(A) Selective Repeat requires W_s + W_r ≤ 2^k, so equal windows max out at 2^(k−1). (B) Go-Back-N has W_r = 1 and requires W_s ≤ 2^k − 1 to avoid sequence wrap-around ambiguity. (D) T_trans ≥ 2·T_prop ensures sender is still transmitting when a worst-case jam signal returns.',
    wrongOptionAnalysis:
      'Option C flips CIDR forwarding! Routers always apply LONGEST Prefix Match (most specific route), never shortest.',
  },

  // ===================== ADDITIONAL HIGH-ROI PYQs TO REACH 42 QUESTIONS =====================
  {
    id: 'q-em-6',
    subjectId: 'em',
    subtopic: 'Probability · Linearity of Expectation',
    format: 'NAT',
    marks: 2,
    difficulty: 'Medium',
    sourceTag: 'GO-Style Concept DPP',
    prompt:
      'n = 50 distinct letters are placed uniformly at random into 50 addressed envelopes (one letter per envelope). What is the expected number of letters placed in their own correct envelope?',
    natAnswer: 1,
    natTolerance: 0,
    explanation:
      'Define indicator random variable X_i = 1 if letter i lands in envelope i, else 0. Clearly P(X_i = 1) = 1/50 ⇒ E[X_i] = 1/50. By Linearity of Expectation (valid despite dependence between X_i!), E[∑ X_i] = ∑_{i=1}^{50} (1/50) = 1. Remarkably, the answer is 1 for ANY n ≥ 1.',
    wrongOptionAnalysis:
      'Attempting to sum over derangement counts D_k wastes huge time; indicator variables solve it in 10 seconds.',
  },
  {
    id: 'q-coa-5',
    subjectId: 'coa',
    subtopic: 'ISA · Addressing Modes',
    format: 'MCQ',
    marks: 1,
    difficulty: 'Easy',
    sourceTag: 'PYQ Pattern · COA',
    prompt:
      'Which addressing mode is most suitable for writing position-independent (relocatable) code for branch target addresses?',
    options: [
      { id: 'A', text: 'Direct addressing' },
      { id: 'B', text: 'PC-relative addressing' },
      { id: 'C', text: 'Immediate addressing' },
      { id: 'D', text: 'Register indirect addressing' },
    ],
    correctOption: 'B',
    explanation:
      'In PC-relative addressing, Effective Address = PC + Offset. Because the relative distance between a branch instruction and its target stays invariant when a code module is relocated in memory, no address patching is needed.',
    wrongOptionAnalysis:
      'Option A embeds absolute memory addresses that break immediately upon relocation.',
  },
  {
    id: 'q-pds-5',
    subjectId: 'pds',
    subtopic: 'Data Structures · Stack Permutations',
    format: 'MCQ',
    marks: 2,
    difficulty: 'Medium',
    sourceTag: 'PYQ Pattern · PDS',
    prompt:
      'Input sequence 1, 2, 3, 4, 5 is pushed onto an initially empty stack in order (with pop operations interleaved arbitrarily). Which of the following output sequences is NOT possible?',
    options: [
      { id: 'A', text: '3, 2, 1, 5, 4' },
      { id: 'B', text: '1, 5, 4, 3, 2' },
      { id: 'C', text: '4, 3, 5, 1, 2' },
      { id: 'D', text: '2, 3, 4, 5, 1' },
    ],
    correctOption: 'C',
    explanation:
      'A sequence is stack-sortable/generatable iff it avoids the 3-1-2 pattern (no larger element popped before two smaller elements appearing in increasing order). In C (4, 3, 5, 1, 2): to pop 4 first, 1, 2, 3 must already be on the stack with 2 above 1! Therefore 2 MUST be popped before 1, making "...1, 2" impossible.',
    wrongOptionAnalysis:
      'Every other sequence obeys LIFO ordering: e.g., in D push 1,2 pop 2; push 3 pop 3; push 4 pop 4; push 5 pop 5; pop 1.',
  },
  {
    id: 'q-algo-5',
    subjectId: 'algo',
    subtopic: 'Greedy · Huffman Coding',
    format: 'NAT',
    marks: 2,
    difficulty: 'Medium',
    sourceTag: 'PYQ Pattern · ALGO',
    prompt:
      'Five symbols have frequencies {5, 9, 12, 13, 16}. What is the weighted external path length (total number of bits to encode all 55 occurrences) of an optimal binary Huffman code?',
    natAnswer: 124,
    natTolerance: 0,
    explanation:
      'Merge lowest two iteratively: (5 + 9 = 14) → pool {12, 13, 14, 16}; (12 + 13 = 25) → pool {14, 16, 25}; (14 + 16 = 30) → pool {25, 30}; (25 + 30 = 55). Total bits = sum of all internal node weights = 14 + 25 + 30 + 55 = 124. Check depths: 5(3), 9(3), 12(2), 13(2), 16(2) ⇒ 5×3 + 9×3 + 12×2 + 13×2 + 16×2 = 15 + 27 + 24 + 26 + 32 = 124.',
    wrongOptionAnalysis:
      'Forgetting to add the root node (55) or re-inserting 14 in the wrong sorted position gives an inaccurate total.',
  },
  {
    id: 'q-os-5',
    subjectId: 'os',
    subtopic: 'Concurrency · Counting Semaphores',
    format: 'NAT',
    marks: 2,
    difficulty: 'Easy',
    sourceTag: 'PYQ Pattern · OS',
    prompt:
      'A counting semaphore S is initialized to 7. Subsequently, 20 P (wait) operations and 15 V (signal) operations are executed on S (assuming no deadlock prevents completion). What is the final value of S?',
    natAnswer: 2,
    natTolerance: 0,
    explanation:
      'Each P (wait) decrements S by 1 and each V (signal) increments S by 1. Final value = 7 − 20 + 15 = 2.',
    wrongOptionAnalysis:
      'Swapping P (proberen/wait = −1) and V (verhogen/signal = +1) gives 7 + 20 − 15 = 12.',
  },
  {
    id: 'q-dbms-5',
    subjectId: 'dbms',
    subtopic: 'Relational Algebra · Division & Joins',
    format: 'MCQ',
    marks: 2,
    difficulty: 'Medium',
    sourceTag: 'GO-Style Concept DPP',
    prompt:
      'Relation R(A, B) has m tuples and S(B, C) has n tuples, where B is a primary key in S and a non-null foreign key in R referencing S(B). How many tuples are guaranteed to be in the natural join R ⋈ S?',
    options: [
      { id: 'A', text: 'At most min(m, n)' },
      { id: 'B', text: 'Exactly m' },
      { id: 'C', text: 'Exactly n' },
      { id: 'D', text: 'Between m and m × n' },
    ],
    correctOption: 'B',
    explanation:
      'Because B is a non-null foreign key in R referencing primary key S(B), referential integrity guarantees that EVERY tuple in R matches AT LEAST ONE tuple in S, and primary-key uniqueness in S guarantees it matches AT MOST ONE tuple in S. Hence every tuple of R joins with exactly 1 tuple of S ⇒ exactly m tuples.',
    wrongOptionAnalysis:
      'Option A forgets that foreign keys are NOT unique in R (multiple tuples of R can reference the same S tuple, so m can exceed n!).',
  },
  {
    id: 'q-cn-4',
    subjectId: 'cn',
    subtopic: 'Data Link · CSMA/CD Minimum Frame Size',
    format: 'NAT',
    marks: 2,
    difficulty: 'Medium',
    sourceTag: 'PYQ Pattern · CN',
    prompt:
      'A 10 Mbps CSMA/CD Ethernet LAN spans a cable of length 2 km with signal propagation speed 2 × 10^8 m/s. What is the minimum frame size (in BYTES) required for reliable collision detection?',
    natAnswer: 25,
    natTolerance: 0,
    natUnit: 'bytes',
    explanation:
      'Propagation delay T_prop = d / v = 2000 m / (2 × 10^8 m/s) = 10^(−5) s = 10 μs. Round-trip time = 2 × T_prop = 20 μs. Minimum bits L_min = RTT × Bandwidth = (20 × 10^(−6) s) × (10 × 10^6 bits/s) = 200 bits. In bytes: 200 / 8 = 25 bytes.',
    wrongOptionAnalysis:
      'Reporting bits (200) instead of BYTES (25), or forgetting the factor of 2 in 2·T_prop (giving 12.5 bytes), are the two classic CN NAT errors.',
  },
];
