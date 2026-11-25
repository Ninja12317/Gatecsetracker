import React from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let readable = 'An unexpected error occurred in the workspace.';
    try {
      const parsed = JSON.parse(error.message) as { error?: string; operationType?: string };
      if (parsed?.error) {
        readable = `Sync safeguard triggered during ${parsed.operationType ?? 'operation'}: ${parsed.error}`;
      }
    } catch {
      if (error.message) readable = error.message;
    }
    return { hasError: true, message: readable };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#FAF8F4] dark:bg-[#130F0D] p-6">
          <div className="w-full max-w-md rounded-[28px] squircle border border-[#E8E0D5] dark:border-[#2E2520] bg-[#FFFFFF] dark:bg-[#1C1714] p-6 shadow-warm space-y-4">
            <div className="flex items-center gap-2 text-[#B83227] dark:text-[#F08A80]">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <h1 className="font-display text-base font-bold text-[#1C1613] dark:text-[#F5F0E8]">
                GATE &apos;27 // WAR ROOM Recovery
              </h1>
            </div>
            <p className="text-xs text-[#61554D] dark:text-[#A99B8E] leading-relaxed font-mono break-words">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-[#6E261A] hover:bg-[#571C13] dark:bg-[#9E3E2E] text-white text-xs font-semibold press-tactile"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reload Workspace
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
