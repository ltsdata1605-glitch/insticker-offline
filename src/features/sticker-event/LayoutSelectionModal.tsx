import React from 'react';
import { PrintSettings, ModernLayoutPositions } from './services/printService';
import { StickerStylePicker } from './stickerprinter/StickerStylePicker';
import type { StickerStyle } from './services/printService';
import { Button } from '../../components/shared/ui/Button';
import { Modal } from '../../components/shared/ui/Modal';

interface LayoutSelectionModalProps {
    onSelect: (tagsPerPage: PrintSettings['tagsPerPage']) => void;
    onClose: () => void;
    stickerStyle: StickerStyle;
    onStickerStyleChange: (style: StickerStyle) => void;
    modernPositions?: ModernLayoutPositions;
    onModernPositionsChange: (positions: ModernLayoutPositions) => void;
    /** Tab Sticker: ô tên danh sách bắt buộc trước khi chọn bố cục. Tab Event không có. */
    listName?: React.ReactNode;
    /** Chưa đặt tên thì chưa chọn được bố cục. */
    layoutDisabled?: boolean;
}

const LayoutOptionButton: React.FC<{
    value: PrintSettings['tagsPerPage'];
    label: string;
    description: string;
    onSelect: (value: PrintSettings['tagsPerPage']) => void;
    disabled?: boolean;
}> = ({ value, label, description, onSelect, disabled }) => (
    <Button
        variant="card"
        size="none"
        disabled={disabled}
        onClick={() => onSelect(value)}
        className="justify-start w-full p-4 rounded-card bg-slate-50 hover:bg-sky-50 border border-slate-200 hover:border-sky-300 duration-200"
    >
        <div>
            <p className="font-bold text-[17px] text-slate-800 leading-7">{label}</p>
            <p className="text-sm text-slate-600">{description}</p>
        </div>
    </Button>
);

const OPTIONS: { value: PrintSettings['tagsPerPage']; label: string; description: string }[] = [
    { value: 1, label: '1 Sticker / Trang', description: 'CE, QĐH, Quạt lớn, MLN' },
    { value: 2, label: '2 Sticker / Trang', description: 'Bộ lau nhà, Bếp đôi, Lò vi sóng, Lò nướng' },
    { value: 4, label: '4 Sticker / Trang', description: 'Nồi cơm, Nồi chiên, Bếp đơn, Nồi, Quạt nhỏ' },
    { value: 8, label: '8 Sticker / Trang', description: 'Máy sấy tóc, bàn ủi, bình đun, Máy xay sinh tố, vợt muỗi, thớt' },
    { value: 16, label: '16 Sticker / Trang', description: 'Camera, DCNB,Chảo, bình giữ nhiệt, rổ, thao' },
    { value: 24, label: '24 Sticker / Trang', description: 'Phụ kiện, SDP, dao, kéo, đũa' },
    { value: 80, label: 'Máy in bill (80mm)', description: 'Khổ giấy in nhiệt K80mm' },
];

/** Hộp chọn kiểu tem và bố cục trang khi in, dùng cho tab Event và tab Sticker. */
const LayoutSelectionModal: React.FC<LayoutSelectionModalProps> = ({ onSelect, onClose, stickerStyle, onStickerStyleChange, listName, layoutDisabled }) => {
    return (
        <Modal
            isOpen={true}
            onClose={onClose}
            title="Chọn Kiểu & Bố Cục In"
            titleColorClass="text-slate-900"
            maxWidth="lg"
        >
            <div className="space-y-4">
                {listName}
                <div className="py-2">
                    <h3 className="text-sm font-semibold text-slate-700 mb-2 uppercase tracking-wide">1. Chọn Kiểu Sticker</h3>
                    <StickerStylePicker value={stickerStyle} onChange={onStickerStyleChange} size="md" />
                </div>

                <div className="space-y-3 pt-2">
                    <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">2. Chọn Bố Cục Trang In</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {OPTIONS.map(option => (
                            <LayoutOptionButton
                                key={option.value}
                                value={option.value}
                                label={option.label}
                                description={option.description}
                                onSelect={onSelect}
                                disabled={layoutDisabled}
                            />
                        ))}
                    </div>
                </div>
            </div>
        </Modal>
    );
};

export default LayoutSelectionModal;
