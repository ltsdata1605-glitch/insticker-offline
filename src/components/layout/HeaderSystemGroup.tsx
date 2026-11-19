import React from 'react';
import FontSelector from './FontSelector';
import { BackupButton } from '../../platform/BackupButton';
import { UpdateButton } from '../../platform/UpdateButton';
import { HeaderSlotTarget } from '../../platform/HeaderSlot';

interface HeaderSystemGroupProps {
    children?: React.ReactNode;
    className?: string;
}

/**
 * Cụm công cụ cuối thanh trên. Bản web có chuông thông báo của dashboard; app offline không có máy chủ
 * để nhận thông báo nên thay bằng nút sao lưu.
 */
export const HeaderSystemGroup: React.FC<HeaderSystemGroupProps> = ({ children, className = '' }) => {
    return (
        <div className={`flex items-center rounded-full ycx-control-group bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm relative z-[150] shrink-0 ${className}`}>
            <FontSelector
                containerClassName="relative flex items-center"
                buttonClassName="w-9 h-9 rounded-[inherit] flex items-center justify-center text-slate-500 hover:text-sky-600 dark:text-slate-400 dark:hover:text-sky-400 hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors"
            />
            {children}

            <div className="border-l border-slate-100 dark:border-slate-700">
                <BackupButton className="relative w-9 h-9 flex items-center justify-center text-slate-500 hover:text-sky-600 dark:text-slate-400 dark:hover:text-sky-400 hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors" />
            </div>
            {/* Nút riêng của màn đang mở, ví dụ nút xoá bảng giá của màn Sticker */}
            <HeaderSlotTarget />
            {/* Nút đầu và cuối nằm trong thẻ bọc nên phải tự nhận bo góc từ thẻ đó, nếu không viền focus lộ góc vuông */}
            <div className="border-l border-slate-100 dark:border-slate-700">
                {/* Có chữ số phiên bản để người dùng nhận ra đây là chỗ xem phiên bản và kiểm tra bản mới */}
                <UpdateButton className="relative h-9 min-w-9 px-3 gap-1.5 rounded-[inherit] flex items-center justify-center text-slate-500 hover:text-sky-600 dark:text-slate-400 dark:hover:text-sky-400 hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors" />
            </div>
        </div>
    );
};

export default HeaderSystemGroup;
