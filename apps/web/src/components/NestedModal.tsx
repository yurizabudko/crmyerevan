import { Modal, type ModalProps } from '@mantine/core';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

interface OpenModals {
  count: number;
  add: () => void;
  remove: () => void;
}

const OpenModalsContext = createContext<OpenModals | null>(null);

/** Счётчик открытых окон — чтобы карточка (Drawer) под окном не закрывалась по Escape. */
export function OpenModalsProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0);
  const actions = useMemo(
    () => ({ add: () => setCount((c) => c + 1), remove: () => setCount((c) => c - 1) }),
    [],
  );
  const value = useMemo(() => ({ count, ...actions }), [count, actions]);
  return <OpenModalsContext.Provider value={value}>{children}</OpenModalsContext.Provider>;
}

/** Открыто ли сейчас какое-нибудь окно поверх карточек. */
export function useHasOpenModal(): boolean {
  return (useContext(OpenModalsContext)?.count ?? 0) > 0;
}

/**
 * Окно, которое может открываться поверх карточки. Mantine слушает Escape на window
 * у каждого окна и панели сразу, поэтому одно нажатие закрывало бы и окно, и карточку.
 * Окно регистрируется в счётчике, а карточки на время его показа не реагируют на Escape.
 */
export function NestedModal(props: ModalProps) {
  const ctx = useContext(OpenModalsContext);
  const add = ctx?.add;
  const remove = ctx?.remove;
  useEffect(() => {
    if (!props.opened || !add || !remove) return;
    add();
    return remove;
  }, [props.opened, add, remove]);
  return <Modal {...props} />;
}
