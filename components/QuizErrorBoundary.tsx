import React from 'react';

type BoundaryProps = {
  children: React.ReactNode;
  onBack: () => void;
  resetKey?: string | number;
};

type BoundaryState = { failed: boolean };

/** Keeps a quiz render error on this screen. The rest of the app stays up. */
export class QuizErrorBoundary extends React.Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(error);
  }

  componentDidUpdate(prev: BoundaryProps) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) {
      this.setState({ failed: false });
    }
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="mx-auto w-full max-w-2xl rounded-xl border-2 border-slate-400 bg-white p-4 text-slate-900 dark:border-slate-500 dark:bg-slate-800 dark:text-slate-50" role="alert">
        <p className="text-lg font-bold">This quiz could not be shown.</p>
        <p className="mt-2 text-base">The rest of the app is still available.</p>
        <button
          type="button"
          onClick={this.props.onBack}
          className="mt-4 rounded-lg bg-blue-700 px-4 py-3 text-base font-bold text-white hover:bg-blue-800"
        >
          Back to the lesson
        </button>
      </div>
    );
  }
}

/** Renders the quiz during this component's render, so the boundary can catch it. */
export function QuizScreen({ render }: { render: () => React.ReactNode }) {
  return <>{render()}</>;
}
