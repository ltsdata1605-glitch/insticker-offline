import { useEffect, useState } from 'react';
import type { UpdateState } from '../../electron/contract';

/** Trạng thái cập nhật do main process quản lý. Null trong tích tắc đầu, trước khi nhận được trạng thái. */
export const useUpdateState = (): UpdateState | null => {
  const [state, setState] = useState<UpdateState | null>(null);

  useEffect(() => {
    let active = true;
    const unsubscribe = window.stickerDesktop.update.onStateChange(setState);
    void window.stickerDesktop.update.getState().then((current) => {
      if (active) setState((previous) => previous ?? current);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return state;
};
