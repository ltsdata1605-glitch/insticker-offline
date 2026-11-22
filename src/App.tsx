import React, { useEffect, useRef, useState } from 'react';
import { AppIcon } from './components/shared/ui/icon/AppIcon';
import type { IconName } from './components/shared/ui/icon';
import { AppToaster } from './components/shared/ui/toast';
import ErrorBoundary from './components/shared/ui/ErrorBoundary';
import StickerPrinterView from './features/sticker-event/StickerPrinterView';
import { TabAccessDialog } from './features/sticker-event/TabAccessDialog';
import { isStickerModuleVisible, useHiddenTabs } from './features/sticker-event/tabAccess';
import KiemHangView from './features/kiem-hang/KiemHangView';
import NhacViecView from './features/nhac-viec/NhacViecView';
import TaoMaView from './features/tao-ma/TaoMaView';
import KiemQuyView from './features/kiem-quy/KiemQuyView';
import InNhanView from './features/in-nhan/InNhanView';
import { NhacViecProvider, useNhacViec } from './features/nhac-viec/NhacViecProvider';
import { ModuleRail, RAIL_ITEMS } from './components/layout/ModuleRail';
import type { RailItem } from './components/layout/ModuleRail';
import { ActiveTabProvider, useActiveTab } from './contexts/LayoutContext';
import type { AppModule } from './contexts/LayoutContext';
import { HeaderSlotProvider } from './platform/HeaderSlot';
import { PrintPreviewHost } from './platform/PrintPreviewHost';
import { UpdateGate } from './platform/UpdateGate';
import { useDownloadNotice } from './platform/useDownloadNotice';

/** Số lần bấm logo liên tiếp để mở bảng bật tắt tab, và khoảng nghỉ tối đa giữa hai lần bấm. */
const LOGO_CLICKS = 7;
const LOGO_CLICK_GAP_MS = 1500;

/** Bấm logo đủ 7 lần liên tiếp thì mở bảng bật tắt tab. Nghỉ quá lâu giữa hai lần bấm thì đếm lại. */
const useLogoClicks = (onReached: () => void) => {
  const count = useRef(0);
  const last = useRef(0);
  return () => {
    const now = Date.now();
    count.current = now - last.current > LOGO_CLICK_GAP_MS ? 1 : count.current + 1;
    last.current = now;
    if (count.current >= LOGO_CLICKS) {
      count.current = 0;
      onReached();
    }
  };
};

/**
 * Lớp của một chức năng. Chức năng không mở thì vẫn giữ trong cây để không mất trạng thái, nhưng trong suốt và inert: không
 * bấm, không tab tới, trình đọc màn hình bỏ qua. Không dùng visibility: vài phần trong màn In sticker tự đặt visible nên vẫn lộ ra.
 */
const ModuleLayer: React.FC<{ shown: boolean; children: React.ReactNode }> = ({ shown, children }) => (
  <div className={`absolute inset-0 ${shown ? '' : 'opacity-0 pointer-events-none'}`} inert={!shown} aria-hidden={shown ? undefined : true}>
    {children}
  </div>
);

/** Tiêu đề và icon trên thanh trên cùng theo chức năng đang mở */
const MODULE_HEADER: Record<AppModule, { first: string; second: string; icon: IconName }> = {
  'tools-print-sticker': { first: 'In', second: 'Sticker', icon: 'print' },
  'tools-kiem-hang': { first: 'Kiểm', second: 'hàng', icon: 'checklist' },
  'tools-nhac-viec': { first: 'Nhắc', second: 'việc', icon: 'notification' },
  'tools-tao-ma': { first: 'Tạo', second: 'mã', icon: 'qrCode' },
  'tools-kiem-quy': { first: 'Kiểm', second: 'quỹ', icon: 'cash' },
  'tools-in-nhan': { first: 'In', second: 'nhãn', icon: 'tag' },
};

/** Thanh bên trái kèm số việc quá hạn của Nhắc việc */
const Rail: React.FC<{ items: readonly RailItem[]; current: AppModule; onSelect: (id: AppModule) => void }> = props => {
  const { badge } = useNhacViec();
  return <ModuleRail {...props} badges={{ 'tools-nhac-viec': badge }} />;
};

/** Khung app: thanh trên cùng, thanh chức năng bên trái (Nhắc việc, Kiểm quỹ, Kiểm hàng, Tạo mã, In nhãn, In sticker) và màn của chức năng đang mở. */
export default function App(): React.JSX.Element {
  return (
    <ActiveTabProvider>
      <AppShell />
    </ActiveTabProvider>
  );
}

function AppShell(): React.JSX.Element {
  useDownloadNotice();
  const [tabAccessOpen, setTabAccessOpen] = useState(false);
  const onLogoClick = useLogoClicks(() => setTabAccessOpen(true));

  // Chức năng bị tắt trong bảng bật tắt tab thì ẩn khỏi thanh bên trái; đang mở mà bị tắt thì chuyển sang chức năng còn bật
  const hiddenTabs = useHiddenTabs();
  const stickerVisible = isStickerModuleVisible(hiddenTabs);
  const kiemHangVisible = !hiddenTabs.includes('kiem-hang');
  const nhacViecVisible = !hiddenTabs.includes('nhac-viec');
  const taoMaVisible = !hiddenTabs.includes('tao-ma');
  const kiemQuyVisible = !hiddenTabs.includes('kiem-quy');
  const inNhanVisible = !hiddenTabs.includes('in-nhan');
  const visible: Record<AppModule, boolean> = { 'tools-print-sticker': stickerVisible, 'tools-kiem-hang': kiemHangVisible, 'tools-nhac-viec': nhacViecVisible, 'tools-tao-ma': taoMaVisible, 'tools-kiem-quy': kiemQuyVisible, 'tools-in-nhan': inNhanVisible };
  const { activeTab, setActiveTab } = useActiveTab();
  const railItems = RAIL_ITEMS.filter(item => visible[item.id]);
  const current: AppModule = visible[activeTab] ? activeTab : railItems[0]?.id ?? 'tools-print-sticker';
  useEffect(() => {
    if (current !== activeTab) setActiveTab(current);
  }, [current, activeTab, setActiveTab]);
  // Kiểm hàng và Nhắc việc chỉ dựng màn khi mở lần đầu, sau đó giữ nguyên để không mất việc đang dở khi chuyển chức năng
  const [opened, setOpened] = useState<Set<AppModule>>(() => new Set([current]));
  useEffect(() => {
    setOpened(set => (set.has(current) ? set : new Set([...set, current])));
  }, [current]);
  const showRail = railItems.length > 1;

  return (
    // Lịch nhắc chạy suốt từ lúc mở app, kể cả khi đang ở chức năng khác hoặc cửa sổ đang ẩn
    <NhacViecProvider enabled={nhacViecVisible} onOpen={() => setActiveTab('tools-nhac-viec')}>
    <HeaderSlotProvider>
      <div className="flex flex-col h-dvh min-w-0">
        <header data-app-chrome="header" className={`block sticky top-0 z-[150] bg-slate-50/90 backdrop-blur-md pt-3 pb-1 border-b border-slate-200/60 ${showRail ? 'pl-3 pr-8' : 'px-8'}`}>
          <div className="flex items-center justify-between gap-4 w-full flex-nowrap">
            <div className="flex items-center shrink-0">
              <div className="w-[56px] flex items-center justify-center shrink-0">
                <div
                  data-testid="app-logo"
                  onClick={onLogoClick}
                  className="w-11 h-11 flex items-center justify-center select-none drop-shadow-[0_3px_6px_rgba(3,105,161,0.3)]"
                >
                  {current === 'tools-print-sticker' ? (
                    // Cùng hình với icon app (sinh từ scripts/tao-icon.mjs)
                    <img src="/in-sticker.svg" alt="" draggable={false} className="w-11 h-11" />
                  ) : (
                    <span data-testid="module-logo" className="w-11 h-11 rounded-[11px] bg-gradient-to-br from-sky-500 to-sky-700 text-white flex items-center justify-center">
                      <AppIcon name={MODULE_HEADER[current].icon} px={24} />
                    </span>
                  )}
                </div>
              </div>
              <div className="h-8 w-1 bg-sky-600 rounded-full shadow-[0_0_12px_rgba(2,132,199,0.4)] ml-1 mr-3" />
              {/* Tiêu đề đổi theo chức năng đang mở */}
              <h1 className="text-[28px] font-black tracking-tight text-slate-900 uppercase leading-none">
                {MODULE_HEADER[current].first} <span className="text-sky-600">{MODULE_HEADER[current].second}</span>
              </h1>
            </div>
            <div className="flex items-center gap-2 shrink-0 justify-end">
              <div id="global-header-actions" className="flex items-center z-50 overflow-visible shrink-0 justify-end" />
            </div>
          </div>
        </header>

        <div className="flex-1 min-h-0 flex">
          {showRail && <Rail items={railItems} current={current} onSelect={setActiveTab} />}
          <main data-app-main className="relative flex-1 min-w-0 min-h-0">
            {stickerVisible && (
              <ModuleLayer shown={current === 'tools-print-sticker'}>
                <ErrorBoundary name="MainContent">
                  <StickerPrinterView />
                </ErrorBoundary>
              </ModuleLayer>
            )}
            {nhacViecVisible && opened.has('tools-nhac-viec') && (
              <ModuleLayer shown={current === 'tools-nhac-viec'}>
                <ErrorBoundary name="NhacViec">
                  <NhacViecView active={current === 'tools-nhac-viec'} />
                </ErrorBoundary>
              </ModuleLayer>
            )}
            {inNhanVisible && opened.has('tools-in-nhan') && (
              <ModuleLayer shown={current === 'tools-in-nhan'}>
                <ErrorBoundary name="InNhan">
                  <InNhanView active={current === 'tools-in-nhan'} />
                </ErrorBoundary>
              </ModuleLayer>
            )}
            {kiemQuyVisible && opened.has('tools-kiem-quy') && (
              <ModuleLayer shown={current === 'tools-kiem-quy'}>
                <ErrorBoundary name="KiemQuy">
                  <KiemQuyView active={current === 'tools-kiem-quy'} />
                </ErrorBoundary>
              </ModuleLayer>
            )}
            {taoMaVisible && opened.has('tools-tao-ma') && (
              <ModuleLayer shown={current === 'tools-tao-ma'}>
                <ErrorBoundary name="TaoMa">
                  <TaoMaView active={current === 'tools-tao-ma'} />
                </ErrorBoundary>
              </ModuleLayer>
            )}
            {kiemHangVisible && opened.has('tools-kiem-hang') && (
              <ModuleLayer shown={current === 'tools-kiem-hang'}>
                <ErrorBoundary name="KiemHang">
                  <KiemHangView active={current === 'tools-kiem-hang'} />
                </ErrorBoundary>
              </ModuleLayer>
            )}
          </main>
        </div>

        {tabAccessOpen && <TabAccessDialog onClose={() => setTabAccessOpen(false)} />}
        <PrintPreviewHost />
        <UpdateGate />
        <AppToaster />
      </div>
    </HeaderSlotProvider>
    </NhacViecProvider>
  );
}
