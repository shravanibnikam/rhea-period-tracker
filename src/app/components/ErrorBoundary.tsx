import { Component, type ReactNode } from "react";
import { Button } from "@/app/components/ui/Button";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("Rhea error:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="flex min-h-dvh items-center justify-center bg-background px-4 font-sans text-foreground">
          <div role="alert" className="max-w-sm text-center">
            <img src={`${import.meta.env.BASE_URL}rhea-mark.svg`} alt="Rhea" width={48} height={48} className="mx-auto size-12" />
            <h1 className="mt-5 text-2xl">Something went wrong</h1>
            <p className="mt-2 text-base text-muted-foreground">
              Rhea ran into an unexpected error. Your saved logs are still on this device.
            </p>
            <Button size="lg" className="mt-6" onClick={() => window.location.reload()}>
              Reload Rhea
            </Button>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}
