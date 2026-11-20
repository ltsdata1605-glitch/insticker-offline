import React, { useState } from 'react';
import { toast } from '../../../components/shared/ui/toast';
import LayoutSelectionModal from '../LayoutSelectionModal';
import { printPriceTags } from '../services/printService';
import type { PrintSettings } from '../services/printService';
import type { Product } from '../types';
import { ListNameField } from './ListNameField';

const layoutLabel = (tagsPerPage: PrintSettings['tagsPerPage']): string =>
    tagsPerPage === 80 ? 'máy in bill 80mm' : `${tagsPerPage} sticker / trang`;

interface TagPrintDialogProps {
    /** Tem cần in, theo đúng thứ tự trong danh sách của tab Sticker. */
    products: Product[];
    settings: PrintSettings;
    employeeName: string;
    onStickerStyleChange: (style: PrintSettings['stickerStyle']) => void;
    /** Bố cục vừa chọn, để khung xem trước hiện theo bố cục này. */
    onTagsPerPageChosen: (tagsPerPage: PrintSettings['tagsPerPage']) => void;
    onClose: () => void;
    /** Tên các lần in trước, để chọn lại nhanh. */
    nameSuggestions: string[];
    /** Gọi khi đã mở màn xem trước bản in, để ghi lịch sử in với tên danh sách vừa nhập. */
    onPrinted: (listName: string) => void;
}

/** Tab Sticker: bấm in thì chọn kiểu tem (có sẵn hoặc hiện đại) và bố cục trang giống tab Event. Tem không có thưởng. */
export const TagPrintDialog: React.FC<TagPrintDialogProps> = ({
    products, settings, employeeName, onStickerStyleChange, onTagsPerPageChosen, onClose, nameSuggestions, onPrinted,
}) => {
    const [listName, setListName] = useState('');
    const print = async (tagsPerPage: PrintSettings['tagsPerPage']) => {
        const name = listName.trim();
        if (!name) return;
        onClose();
        onTagsPerPageChosen(tagsPerPage);
        try {
            await printPriceTags(products, employeeName, { ...settings, tagsPerPage, showBonus: false }, {
                title: 'In Sticker',
                note: `${products.reduce((sum, product) => sum + (product.quantity || 1), 0)} sticker, ${layoutLabel(tagsPerPage)}.`,
            });
            onPrinted(name);
        } catch (e) {
            console.error(e);
            toast.error('Không tạo được bản in. Vui lòng thử lại.');
        }
    };

    return (
        <LayoutSelectionModal
            onSelect={print}
            onClose={onClose}
            stickerStyle={settings.stickerStyle}
            onStickerStyleChange={onStickerStyleChange}
            onModernPositionsChange={() => {}}
            layoutDisabled={!listName.trim()}
            listName={
                <ListNameField
                    value={listName}
                    onChange={setListName}
                    suggestions={nameSuggestions}
                    onSubmit={() => print(settings.tagsPerPage)}
                />
            }
        />
    );
};
