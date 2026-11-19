import React, { createContext, useContext, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

interface SlotState {
  target: HTMLElement | null;
  setTarget: (element: HTMLElement | null) => void;
}

const SlotContext = createContext<SlotState>({ target: null, setTarget: () => undefined });

export const HeaderSlotProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const value = useMemo(() => ({ target, setTarget }), [target]);
  return <SlotContext.Provider value={value}>{children}</SlotContext.Provider>;
};

/** Chỗ trống trong cụm nút cuối thanh trên. Không chiếm chỗ khi trống. */
export const HeaderSlotTarget: React.FC = () => {
  const { setTarget } = useContext(SlotContext);
  return <div ref={setTarget} className="contents" />;
};

/**
 * Đặt nút của một màn lên cụm nút cuối thanh trên. Nút vẫn nằm trong màn đó nên dùng thẳng trạng thái và hộp xác nhận
 * của màn. Giữ chỗ bằng state chứ không tìm theo id vì thanh trên được dựng sau màn.
 */
export const HeaderSlot: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { target } = useContext(SlotContext);
  return target ? createPortal(children, target) : null;
};
