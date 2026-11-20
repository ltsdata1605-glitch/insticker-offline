import React, { useId } from 'react';
import { Input } from '../../../components/shared/ui/Input';

/** Bỏ dấu và chữ hoa để tìm tên danh sách: "may loc" tìm được "MÁY LỌC NƯỚC". */
export const searchKey = (text: string): string =>
    text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim();

interface ListNameFieldProps {
    value: string;
    onChange: (value: string) => void;
    /** Tên các lần in trước, để chọn lại nhanh. */
    suggestions: string[];
    /** Enter trong ô tên: in theo lựa chọn đang chọn sẵn. */
    onSubmit?: () => void;
}

/** Ô tên danh sách ở hộp in: bắt buộc, lưu vào Lịch sử để lần sau tra cứu lại. */
export const ListNameField: React.FC<ListNameFieldProps> = ({ value, onChange, suggestions, onSubmit }) => {
    const id = useId();
    return (
        <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-name`} className="text-sm font-semibold text-slate-700">Tên danh sách</label>
            <Input
                id={`${id}-name`}
                autoFocus
                autoComplete="off"
                list={`${id}-names`}
                maxLength={80}
                value={value}
                placeholder="VD: Quạt điều hoà tuần 3/12"
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' && value.trim() && onSubmit) {
                        e.preventDefault();
                        onSubmit();
                    }
                }}
            />
            <datalist id={`${id}-names`}>
                {suggestions.map(name => <option key={name} value={name} />)}
            </datalist>
            <p className="text-xs text-slate-500">
                {value.trim() ? 'Danh sách được lưu vào tab Lịch sử với tên này để tra cứu lại.' : 'Nhập tên để in. Danh sách được lưu vào tab Lịch sử để tra cứu lại.'}
            </p>
        </div>
    );
};
