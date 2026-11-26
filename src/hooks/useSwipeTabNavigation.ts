import { useState, useRef, useCallback, useEffect } from 'react';
import type React from 'react';
import type { NavView } from '../types';
import {
  classifySwipeAxis,
  computeSwipeVisualOffset,
  evaluateSwipeCommit,
  shouldBypassSwipeTarget,
  type MobileBottomTabItem,
} from '../utils/mobileNav';

interface UseSwipeTabNavigationOptions {
  activeView: NavView;
  enabled: boolean;
  disabled?: boolean;
  simpleMode?: boolean;
  onSelectTab: (view: NavView) => void;
}

export interface SwipeTabNavigationState {
  dragOffsetX: number;
  isDragging: boolean;
  isSnapping: boolean;
  peekTab: MobileBottomTabItem | null;
  peekSide: 'left' | 'right' | null;
  isMobileViewport: boolean;
  isKeyboardOpen: boolean;
  touchHandlers: {
    onTouchStart: (e: React.TouchEvent<HTMLElement>) => void;
    onTouchMove: (e: React.TouchEvent<HTMLElement>) => void;
    onTouchEnd: (e: React.TouchEvent<HTMLElement>) => void;
    onTouchCancel: () => void;
  };
}

interface TouchSession {
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  startTime: number;
  axisLock: 'pending' | 'horizontal' | 'vertical';
  bypassed: boolean;
}

export function useSwipeTabNavigation({
  activeView,
  enabled,
  disabled = false,
  simpleMode = false,
  onSelectTab,
}: UseSwipeTabNavigationOptions): SwipeTabNavigationState {
  const [dragOffsetX, setDragOffsetX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isSnapping, setIsSnapping] = useState(false);
  const [peekTab, setPeekTab] = useState<MobileBottomTabItem | null>(null);
  const [peekSide, setPeekSide] = useState<'left' | 'right' | null>(null);
  const [isMobileViewport, setIsMobileViewport] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  const sessionRef = useRef<TouchSession | null>(null);
  const snapTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => {
      setIsMobileViewport(window.innerWidth < 768);
    };
    window.addEventListener('resize', onResize, { passive: true });
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Detect mobile soft keyboard via visualViewport shrink or focused text input on mobile
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const vv = window.visualViewport;
    const checkKeyboard = () => {
      if (window.innerWidth >= 768) {
        setIsKeyboardOpen(false);
        return;
      }
      const heightDiff = vv ? window.innerHeight - vv.height : 0;
      const activeEl = document.activeElement as HTMLElement | null;
      const isTextFocused =
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.isContentEditable) &&
        (activeEl as HTMLInputElement).type !== 'checkbox' &&
        (activeEl as HTMLInputElement).type !== 'radio' &&
        (activeEl as HTMLInputElement).type !== 'range';
      setIsKeyboardOpen(heightDiff > 150 || Boolean(isTextFocused && heightDiff > 80));
    };

    vv?.addEventListener('resize', checkKeyboard);
    window.addEventListener('focusin', checkKeyboard);
    window.addEventListener('focusout', checkKeyboard);
    return () => {
      vv?.removeEventListener('resize', checkKeyboard);
      window.removeEventListener('focusin', checkKeyboard);
      window.removeEventListener('focusout', checkKeyboard);
    };
  }, []);

  const clearSnapTimer = () => {
    if (snapTimerRef.current !== null) {
      window.clearTimeout(snapTimerRef.current);
      snapTimerRef.current = null;
    }
  };

  const resetVisuals = useCallback((withSpring = true) => {
    clearSnapTimer();
    setIsDragging(false);
    setPeekTab(null);
    setPeekSide(null);
    if (withSpring) {
      setIsSnapping(true);
      setDragOffsetX(0);
      snapTimerRef.current = window.setTimeout(() => {
        setIsSnapping(false);
      }, 280);
    } else {
      setIsSnapping(false);
      setDragOffsetX(0);
    }
  }, []);

  useEffect(() => {
    return () => clearSnapTimer();
  }, []);

  const canSwipeNow = enabled && !disabled && isMobileViewport;

  const onTouchStart = useCallback(
    (e: React.TouchEvent<HTMLElement>) => {
      if (!canSwipeNow || e.touches.length !== 1) {
        sessionRef.current = null;
        return;
      }
      const target = e.target as HTMLElement | null;
      const bypassed = shouldBypassSwipeTarget(target);
      const touch = e.touches[0];
      sessionRef.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        lastX: touch.clientX,
        lastY: touch.clientY,
        startTime: performance.now(),
        axisLock: 'pending',
        bypassed,
      };
    },
    [canSwipeNow]
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent<HTMLElement>) => {
      const s = sessionRef.current;
      if (!s || s.bypassed || !canSwipeNow || e.touches.length !== 1) return;

      const touch = e.touches[0];
      const dx = touch.clientX - s.startX;
      const dy = touch.clientY - s.startY;
      s.lastX = touch.clientX;
      s.lastY = touch.clientY;

      if (s.axisLock === 'vertical') return;

      if (s.axisLock === 'pending') {
        const decision = classifySwipeAxis(dx, dy);
        if (decision.lock === 'vertical') {
          s.axisLock = 'vertical';
          return;
        }
        if (decision.lock === 'horizontal') {
          s.axisLock = 'horizontal';
          clearSnapTimer();
          setIsSnapping(false);
          setIsDragging(true);
        } else {
          return;
        }
      }

      const vw = typeof window !== 'undefined' ? window.innerWidth : 390;
      const visual = computeSwipeVisualOffset(dx, activeView, vw, simpleMode);
      setDragOffsetX(visual.offsetX);
      setPeekTab(visual.peekTab);
      setPeekSide(visual.peekTab ? (dx > 0 ? 'left' : 'right') : null);
    },
    [activeView, canSwipeNow, simpleMode]
  );

  const onTouchEnd = useCallback(
    (e: React.TouchEvent<HTMLElement>) => {
      const s = sessionRef.current;
      sessionRef.current = null;
      if (!s || s.bypassed || s.axisLock !== 'horizontal') {
        if (isDragging) resetVisuals(true);
        return;
      }

      const endTouch = e.changedTouches[0];
      const finalX = endTouch ? endTouch.clientX : s.lastX;
      const finalY = endTouch ? endTouch.clientY : s.lastY;
      const dx = finalX - s.startX;
      const dy = finalY - s.startY;
      const durationMs = performance.now() - s.startTime;
      const vw = typeof window !== 'undefined' ? window.innerWidth : 390;

      const decision = evaluateSwipeCommit({
        dx,
        dy,
        durationMs,
        viewportWidth: vw,
        currentView: activeView,
        simpleMode,
      });

      if (decision.shouldCommit && decision.targetTab) {
        resetVisuals(true);
        onSelectTab(decision.targetTab.id);
      } else {
        resetVisuals(true);
      }
    },
    [activeView, isDragging, onSelectTab, resetVisuals, simpleMode]
  );

  const onTouchCancel = useCallback(() => {
    sessionRef.current = null;
    resetVisuals(true);
  }, [resetVisuals]);

  return {
    dragOffsetX,
    isDragging,
    isSnapping,
    peekTab,
    peekSide,
    isMobileViewport,
    isKeyboardOpen,
    touchHandlers: {
      onTouchStart,
      onTouchMove,
      onTouchEnd,
      onTouchCancel,
    },
  };
}
