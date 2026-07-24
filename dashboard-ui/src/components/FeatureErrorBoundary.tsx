import { Component, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { toUserMessage } from '../services/error-handler';

interface Props {
  children: ReactNode;
  name?: string;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

/**
 * Feature-level error boundary that catches errors in a single component
 * without crashing the entire app. Shows a compact error card inline.
 */
export class FeatureErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: toUserMessage(error) };
  }

  componentDidCatch(error: Error) {
    console.error(`[FeatureErrorBoundary${this.props.name ? ` ${this.props.name}` : ''}]`, error.message);
  }

  handleDismiss = () => {
    this.setState({ hasError: false, message: '' });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
          <div className="bg-[var(--color-danger-light)] border border-[var(--color-danger)]/20 rounded-xl p-5 flex items-start gap-3">
            <AlertTriangle size={20} className="text-[var(--color-danger)] flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[var(--color-danger)]">
                {this.state.message}
              </p>
              <p className="text-xs text-[var(--color-danger)]/70 mt-1">
                This section encountered a problem. Other parts of the app are unaffected.
              </p>
            </div>
            <button
              onClick={this.handleDismiss}
              className="text-[var(--color-danger)]/50 hover:text-[var(--color-danger)] transition-colors flex-shrink-0 cursor-pointer"
              title="Dismiss"
            >
              <AlertTriangle size={16} />
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
