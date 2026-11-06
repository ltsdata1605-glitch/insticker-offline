import React from 'react';
import FontSelector from './FontSelector';
import { BackupButton } from '../../platform/BackupButton';
import { UpdateButton } from '../../platform/UpdateButton';

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
                buttonClassName="w-9 h-9 flex items-center justify-center text-slate-500 hover:text-sky-600 dark:text-slate-400 dark:hover:text-sky-400 hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors"
            />
            {children}

            <div className="border-l border-slate-100 dark:border-slate-700">
                <BackupButton className="relative w-9 h-9 flex items-center justify-center text-slate-500 hover:text-sky-600 dark:text-slate-400 dark:hover:text-sky-400 hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors" />
            </div>
            <div className="border-l border-slate-100 dark:border-slate-700">
                <UpdateButton className="relative w-9 h-9 flex items-center justify-center text-slate-500 hover:text-sky-600 dark:text-slate-400 dark:hover:text-sky-400 hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors" />
            </div>
        </div>
    );
};

export default HeaderSystemGroup;
