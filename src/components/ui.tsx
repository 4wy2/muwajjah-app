import {
  Component,
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  LoaderCircle,
  X,
  SearchX,
} from "lucide-react";
import { friendly } from "../lib/utils";
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <ErrorState
        error={new Error("تعذر عرض هذا الجزء.")}
        retry={() => this.setState({ error: false })}
      />
    ) : (
      this.props.children
    );
  }
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={24} /> جارٍ التحميل…
    </div>
  );
}
export function ErrorState({
  error,
  retry,
}: {
  error: unknown;
  retry?: () => void;
}) {
  return (
    <div className="state error" role="alert">
      <AlertCircle />
      <h3>تعذر إكمال الطلب</h3>
      <p>{friendly(error)}</p>
      {retry && (
        <button className="btn secondary" onClick={retry}>
          إعادة المحاولة
        </button>
      )}
    </div>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="state">
      <SearchX size={32} />
      <h3>{title}</h3>
      {children}
    </div>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const el = ref.current;
    if (open && !el?.open) el?.showModal();
    if (!open && el?.open) el.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onCancel={() => closeRef.current()}
      onClose={() => closeRef.current()}
    >
      <header className="modal-header">
        <h2>{title}</h2>
        <button className="icon-btn" aria-label="إغلاق" onClick={onClose}>
          <X />
        </button>
      </header>
      {children}
    </dialog>
  );
}
export function Confirm({
  open,
  title,
  body,
  onClose,
  onConfirm,
  busy,
}: {
  open: boolean;
  title: string;
  body: string;
  onClose: () => void;
  onConfirm: () => void;
  busy?: boolean;
}) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <p>{body}</p>
      <div className="actions">
        <button className="btn danger" disabled={busy} onClick={onConfirm}>
          {busy ? "جارٍ التنفيذ…" : "تأكيد"}
        </button>
        <button className="btn secondary" disabled={busy} onClick={onClose}>
          إلغاء
        </button>
      </div>
    </Modal>
  );
}
const ToastContext = createContext<(message: string, error?: boolean) => void>(
  () => {},
);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{
    message: string;
    error?: boolean;
  } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6500);
    return () => clearTimeout(t);
  }, [toast]);
  return (
    <ToastContext.Provider
      value={(message, error) => setToast({ message, error })}
    >
      {children}
      {toast && (
        <div
          className={"toast " + (toast.error ? "error" : "")}
          role={toast.error ? "alert" : "status"}
        >
          {toast.error ? <AlertCircle /> : <CheckCircle2 />}
          <span>{toast.message}</span>
          <button aria-label="إغلاق التنبيه" onClick={() => setToast(null)}>
            <X size={18} />
          </button>
        </div>
      )}
    </ToastContext.Provider>
  );
}
export const useToast = () => useContext(ToastContext);
export function PageHeading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {children}
    </div>
  );
}
export function Arrow() {
  return <ArrowLeft size={17} />;
}
export function useDebounce<T>(value: T, delay = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}
