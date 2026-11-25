import React, { useState, useRef } from 'react';
import { X, Delete, GripHorizontal } from 'lucide-react';
import {
  applyUnaryCalcOp,
  applyBinaryCalcOp,
  formatCalcResult,
} from '../utils/gateMath';

interface CalculatorDrawerProps {
  open: boolean;
  onClose: () => void;
}

type BinaryOp = '+' | '-' | '*' | '/' | 'pow' | 'mod';

export const CalculatorDrawer: React.FC<CalculatorDrawerProps> = ({ open, onClose }) => {
  const [display, setDisplay] = useState('0');
  const [storedValue, setStoredValue] = useState<number | null>(null);
  const [pendingOp, setPendingOp] = useState<BinaryOp | null>(null);
  const [resetOnNextDigit, setResetOnNextDigit] = useState(false);
  const [memory, setMemory] = useState(0);
  const [angleMode, setAngleMode] = useState<'DEG' | 'RAD'>('DEG');
  const [historyLine, setHistoryLine] = useState('');
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(
    null
  );

  if (!open) return null;

  const handleDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: offset.x,
      origY: offset.y,
    };
  };

  const handleDragMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setOffset({ x: dragRef.current.origX + dx, y: dragRef.current.origY + dy });
  };

  const handleDragEnd = () => {
    dragRef.current = null;
  };

  const currentVal = () => {
    const n = Number(display);
    return Number.isNaN(n) ? 0 : n;
  };

  const inputDigit = (digit: string) => {
    if (display === 'Error' || resetOnNextDigit) {
      setDisplay(digit === '.' ? '0.' : digit);
      setResetOnNextDigit(false);
      return;
    }
    if (digit === '.' && display.includes('.')) return;
    if (display === '0' && digit !== '.') {
      setDisplay(digit);
    } else {
      setDisplay(display + digit);
    }
  };

  const handleClear = () => {
    setDisplay('0');
    setStoredValue(null);
    setPendingOp(null);
    setResetOnNextDigit(false);
    setHistoryLine('');
  };

  const handleBackspace = () => {
    if (display === 'Error' || resetOnNextDigit) {
      setDisplay('0');
      setResetOnNextDigit(false);
      return;
    }
    if (display.length <= 1) {
      setDisplay('0');
    } else {
      setDisplay(display.slice(0, -1));
    }
  };

  const handleBinary = (op: BinaryOp) => {
    const val = currentVal();
    if (storedValue !== null && pendingOp && !resetOnNextDigit) {
      const res = applyBinaryCalcOp(pendingOp, storedValue, val);
      const formatted = formatCalcResult(res);
      setDisplay(formatted);
      setStoredValue(formatted === 'Error' ? null : Number(formatted));
      setHistoryLine(`${formatted} ${opSymbol(op)}`);
    } else {
      setStoredValue(val);
      setHistoryLine(`${formatCalcResult(val)} ${opSymbol(op)}`);
    }
    setPendingOp(op);
    setResetOnNextDigit(true);
  };

  const handleEquals = () => {
    if (storedValue === null || !pendingOp) return;
    const val = currentVal();
    const res = applyBinaryCalcOp(pendingOp, storedValue, val);
    const formatted = formatCalcResult(res);
    setHistoryLine(`${formatCalcResult(storedValue)} ${opSymbol(pendingOp)} ${formatCalcResult(val)} =`);
    setDisplay(formatted);
    setStoredValue(null);
    setPendingOp(null);
    setResetOnNextDigit(true);
  };

  const handleUnary = (
    op: Parameters<typeof applyUnaryCalcOp>[0],
    label: string
  ) => {
    const val = currentVal();
    const res = applyUnaryCalcOp(op, val, angleMode);
    const formatted = formatCalcResult(res);
    setHistoryLine(`${label}(${formatCalcResult(val)})`);
    setDisplay(formatted);
    setResetOnNextDigit(true);
  };

  const insertConstant = (name: 'π' | 'e', val: number) => {
    setDisplay(formatCalcResult(val));
    setHistoryLine(name);
    setResetOnNextDigit(true);
  };

  function opSymbol(op: BinaryOp): string {
    switch (op) {
      case 'pow':
        return '^';
      case 'mod':
        return 'mod';
      case '*':
        return '×';
      case '/':
        return '÷';
      default:
        return op;
    }
  }

  const keyBase =
    'h-9 rounded-full border text-xs font-mono font-semibold flex items-center justify-center select-none press-tactile';
  const keySci = `${keyBase} border-[#E8E0D5] dark:border-[#2E2520] bg-[#FAF8F4] dark:bg-[#241D19] text-[#61554D] dark:text-[#D8CBB8] hover:bg-[#EFE9DF] dark:hover:bg-[#312722]`;
  const keyNum = `${keyBase} border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] text-[#1C1613] dark:text-[#F5F0E8] hover:bg-[#FAF8F4] dark:hover:bg-[#2A221D]`;
  const keyOp = `${keyBase} border-[#EED89A] dark:border-[#5C441B] bg-[#FDF6E3] dark:bg-[#332714] text-[#8B6209] dark:text-[#E0A92E] hover:bg-[#F7EAC2] dark:hover:bg-[#423219]`;

  return (
    <div
      role="dialog"
      aria-label="GATE Virtual Scientific Calculator"
      style={{ transform: `translate3d(${offset.x}px, ${offset.y}px, 0)` }}
      className="fixed bottom-5 right-5 z-50 w-[340px] max-w-[calc(100vw-2rem)] rounded-[28px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] shadow-warm-lg overflow-hidden will-change-transform"
    >
      {/* Draggable Header */}
      <div
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
        onPointerCancel={handleDragEnd}
        className="flex items-center justify-between px-4 py-3 border-b border-[#E8E0D5] dark:border-[#2E2520] bg-[#F4EFE6] dark:bg-[#241D19] cursor-grab active:cursor-grabbing select-none"
      >
        <div className="flex items-center gap-2">
          <GripHorizontal className="h-3.5 w-3.5 text-[#8C7E75]" aria-hidden="true" />
          <span className="font-display text-xs font-bold text-[#1C1613] dark:text-[#F5F0E8]">
            GATE Calculator
          </span>
          <button
            type="button"
            onClick={() => setAngleMode((m) => (m === 'DEG' ? 'RAD' : 'DEG'))}
            className="px-2 py-0.5 rounded-full border border-[#EED89A] dark:border-[#5C441B] bg-[#FDF6E3] dark:bg-[#332714] font-mono text-[10px] font-bold text-[#8B6209] dark:text-[#E0A92E]"
            aria-label={`Angle mode ${angleMode}, click to toggle`}
          >
            {angleMode}
          </button>
          {memory !== 0 && (
            <span className="font-mono text-[10px] font-bold text-[#6E261A] dark:text-[#E0A92E]">
              M={formatCalcResult(memory)}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close calculator"
          className="p-1 rounded-full text-[#61554D] hover:text-[#1C1613] dark:text-[#A99B8E] dark:hover:text-[#F5F0E8]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Roasted Cocoa High-Contrast Display */}
      <div className="px-4 py-3.5 bg-[#241914] dark:bg-[#16100D] text-right">
        <div className="h-4 font-mono text-[11px] text-[#C8B9AA] truncate tabular-nums">
          {historyLine || 'Ready'}
        </div>
        <div
          data-testid="calc-display"
          className="mt-1 font-mono text-2xl font-bold tracking-tight text-[#FAF5EB] truncate tabular-nums"
        >
          {display}
        </div>
      </div>

      {/* Tactile Pill Keypad */}
      <div className="p-3.5 space-y-1.5">
        {/* Memory Row */}
        <div className="grid grid-cols-5 gap-1.5">
          <button type="button" onClick={() => setMemory(0)} className={keySci}>MC</button>
          <button
            type="button"
            onClick={() => {
              setDisplay(formatCalcResult(memory));
              setResetOnNextDigit(true);
            }}
            className={keySci}
          >
            MR
          </button>
          <button
            type="button"
            onClick={() => setMemory((m) => m + currentVal())}
            className={keySci}
          >
            M+
          </button>
          <button
            type="button"
            onClick={() => setMemory((m) => m - currentVal())}
            className={keySci}
          >
            M−
          </button>
          <button
            type="button"
            onClick={handleClear}
            className={`${keyBase} border-[#EBC7C3] dark:border-[#5E2823] bg-[#FBEAE8] dark:bg-[#3A1E1B] text-[#B83227] dark:text-[#F08A80] hover:bg-[#F5D7D3]`}
          >
            AC
          </button>
        </div>

        {/* Scientific Row 1 */}
        <div className="grid grid-cols-5 gap-1.5">
          <button type="button" onClick={() => handleUnary('sin', 'sin')} className={keySci}>sin</button>
          <button type="button" onClick={() => handleUnary('cos', 'cos')} className={keySci}>cos</button>
          <button type="button" onClick={() => handleUnary('tan', 'tan')} className={keySci}>tan</button>
          <button type="button" onClick={() => handleUnary('log', 'log10')} className={keySci}>log</button>
          <button type="button" onClick={() => handleUnary('ln', 'ln')} className={keySci}>ln</button>
        </div>

        {/* Scientific Row 2 */}
        <div className="grid grid-cols-5 gap-1.5">
          <button type="button" onClick={() => handleBinary('pow')} className={keySci}>xʸ</button>
          <button type="button" onClick={() => handleUnary('pow2', '2^')} className={keySci}>2ˣ</button>
          <button type="button" onClick={() => handleUnary('exp', 'e^')} className={keySci}>eˣ</button>
          <button type="button" onClick={() => handleUnary('fact', 'fact')} className={keySci}>n!</button>
          <button type="button" onClick={() => handleBinary('mod')} className={keySci}>mod</button>
        </div>

        {/* Scientific Row 3 */}
        <div className="grid grid-cols-5 gap-1.5">
          <button type="button" onClick={() => handleUnary('sq', 'sq')} className={keySci}>x²</button>
          <button type="button" onClick={() => handleUnary('sqrt', '√')} className={keySci}>√x</button>
          <button type="button" onClick={() => handleUnary('inv', '1/')} className={keySci}>1/x</button>
          <button type="button" onClick={() => insertConstant('π', Math.PI)} className={keySci}>π</button>
          <button type="button" onClick={() => insertConstant('e', Math.E)} className={keySci}>e</button>
        </div>

        {/* Numbers & Standard Ops */}
        <div className="grid grid-cols-4 gap-1.5 pt-1">
          <button type="button" onClick={() => inputDigit('7')} className={keyNum}>7</button>
          <button type="button" onClick={() => inputDigit('8')} className={keyNum}>8</button>
          <button type="button" onClick={() => inputDigit('9')} className={keyNum}>9</button>
          <button type="button" onClick={() => handleBinary('/')} className={keyOp}>÷</button>

          <button type="button" onClick={() => inputDigit('4')} className={keyNum}>4</button>
          <button type="button" onClick={() => inputDigit('5')} className={keyNum}>5</button>
          <button type="button" onClick={() => inputDigit('6')} className={keyNum}>6</button>
          <button type="button" onClick={() => handleBinary('*')} className={keyOp}>×</button>

          <button type="button" onClick={() => inputDigit('1')} className={keyNum}>1</button>
          <button type="button" onClick={() => inputDigit('2')} className={keyNum}>2</button>
          <button type="button" onClick={() => inputDigit('3')} className={keyNum}>3</button>
          <button type="button" onClick={() => handleBinary('-')} className={keyOp}>−</button>

          <button type="button" onClick={() => handleUnary('neg', '±')} className={keySci}>±</button>
          <button type="button" onClick={() => inputDigit('0')} className={keyNum}>0</button>
          <button type="button" onClick={() => inputDigit('.')} className={keyNum}>.</button>
          <button type="button" onClick={() => handleBinary('+')} className={keyOp}>+</button>
        </div>

        <div className="grid grid-cols-4 gap-1.5">
          <button
            type="button"
            onClick={handleBackspace}
            aria-label="Backspace"
            className={`${keySci} col-span-1`}
          >
            <Delete className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => handleUnary('abs', 'abs')}
            className={`${keySci} col-span-1`}
          >
            |x|
          </button>
          <button
            type="button"
            onClick={handleEquals}
            className={`${keyBase} col-span-2 border-[#6E261A] dark:border-[#9E3E2E] bg-[#6E261A] hover:bg-[#571C13] dark:bg-[#9E3E2E] dark:hover:bg-[#B54A38] text-white font-bold`}
          >
            =
          </button>
        </div>
      </div>
    </div>
  );
};
