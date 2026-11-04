import type { DesktopApi } from '../electron/contract';

declare global {
  interface Window {
    stickerDesktop: DesktopApi;
  }
}
