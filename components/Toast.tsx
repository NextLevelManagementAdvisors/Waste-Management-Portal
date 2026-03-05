import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { CheckCircleIcon, XCircleIcon, ExclamationTriangleIcon, XMarkIcon } from './Icons.tsx';

type ToastType = 'success' | 'error' | 'warning';

interface Toast {
    id: number;
    type: ToastType;
    message: string;
}

interface ToastContextValue {
    showToast: (type: ToastType, message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const useToast = (): ToastContextValue => {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error('useToast must be used within a ToastProvider');
    return ctx;
};

const ICON_MAP: Record<ToastType, React.FC<React.SVGProps<SVGSVGElement>>> = {
    success: CheckCircleIcon,
    error: XCircleIcon,
    warning: ExclamationTriangleIcon,
};

const STYLE_MAP: Record<ToastType, string> = {
    success: 'bg-green-50 border-green-300 text-green-800',
    error: 'bg-red-50 border-red-300 text-red-800',
    warning: 'bg-yellow-50 border-yellow-300 text-yellow-800',
};

const ICON_COLOR: Record<ToastType, string> = {
    success: 'text-green-500',
    error: 'text-red-500',
    warning: 'text-yellow-500',
};

const ToastItem: React.FC<{ toast: Toast; onDismiss: (id: number) => void }> = ({ toast, onDismiss }) => {
    const [exiting, setExiting] = useState(false);
    const timerRef = useRef<ReturnType<typeof setTimeout>>();

    useEffect(() => {
        timerRef.current = setTimeout(() => setExiting(true), 4000);
        return () => clearTimeout(timerRef.current);
    }, []);

    useEffect(() => {
        if (exiting) {
            const t = setTimeout(() => onDismiss(toast.id), 300);
            return () => clearTimeout(t);
        }
    }, [exiting, onDismiss, toast.id]);

    const Icon = ICON_MAP[toast.type];

    return (
        <div
            role="alert"
            className={`flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg max-w-sm w-full transition-all duration-300 ${STYLE_MAP[toast.type]} ${exiting ? 'opacity-0 translate-x-4' : 'opacity-100 translate-x-0'}`}
        >
            <Icon className={`w-5 h-5 flex-shrink-0 ${ICON_COLOR[toast.type]}`} />
            <p className="text-sm font-medium flex-1">{toast.message}</p>
            <button
                onClick={() => setExiting(true)}
                className="flex-shrink-0 p-0.5 rounded-full hover:bg-black/5 transition-colors"
                aria-label="Dismiss notification"
            >
                <XMarkIcon className="w-4 h-4" />
            </button>
        </div>
    );
};

let nextId = 0;

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const showToast = useCallback((type: ToastType, message: string) => {
        setToasts(prev => [...prev, { id: ++nextId, type, message }]);
    }, []);

    const dismiss = useCallback((id: number) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
                {toasts.map(toast => (
                    <div key={toast.id} className="pointer-events-auto">
                        <ToastItem toast={toast} onDismiss={dismiss} />
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
};
