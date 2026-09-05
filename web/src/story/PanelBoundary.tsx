import { Component, type ReactNode } from "react";

/* ---------- Panel error boundary ----------
 * Satu panel gagal ≠ seluruh halaman putih (insiden SatObsPanel 2026-09-04:
 * data JSON lama membuat satu panel melempar dan tree penuh unmount).
 * Prinsip: panel adalah lampu bohlam, bukan rumah. */

interface Props { children: ReactNode; label: string }
interface State { error: Error | null }

export default class PanelBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <p role="alert" className="mt-4 rounded-lg bg-risk-high/10 p-3 text-sm text-[#a04d22]">
          {this.props.label} tidak dapat ditampilkan saat ini — data mungkin tidak tersedia.
          Bagian lain cerita tetap dapat dibaca.
        </p>
      );
    }
    return this.props.children;
  }
}
