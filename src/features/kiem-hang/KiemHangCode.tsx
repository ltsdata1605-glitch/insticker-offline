import React from 'react';

/** Số ký tự cuối được tô to: người kiểm thường dò 6 số cuối trên tem hộp với màn hình. */
export const TAIL_LENGTH = 6;

export const splitTail = (value: string, tail = TAIL_LENGTH): [string, string] =>
    value.length > tail ? [value.slice(0, -tail), value.slice(-tail)] : ['', value];

interface CodeTextProps {
    value: string;
    /** Lớp cho cả cụm (cỡ chữ phần đầu, màu phần đầu) */
    className?: string;
    /** Lớp cho 6 ký tự cuối */
    tailClassName?: string;
}

/** Mã sản phẩm hoặc IMEI: phần đầu bình thường, 6 ký tự cuối to và nổi màu. Hai phần liền nhau nên chép và tìm vẫn nguyên mã. */
export const CodeText: React.FC<CodeTextProps> = ({ value, className = '', tailClassName = '' }) => {
    const [head, tail] = splitTail(value);
    return (
        <span className={`whitespace-nowrap tabular-nums tracking-wide ${className}`}>
            {head}<span className={tailClassName}>{tail}</span>
        </span>
    );
};
