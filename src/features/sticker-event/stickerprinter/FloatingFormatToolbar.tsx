import React, { useState, useEffect, useRef } from 'react';
import { AppIcon } from '../../../components/shared/ui/icon/AppIcon';
import { Button } from '../../../components/shared/ui/Button';
import { Input } from '../../../components/shared/ui/Input';
import {
    detectFieldName as detectField,
    FIELD_SIZE_EVENT,
    isDrawField,
    resetFieldFormatting,
    DEFAULT_FIELD_SIZES,
} from './fieldFontSizes';
import type { FieldSizeChange, StickerFieldName } from './fieldFontSizes';

interface FloatingFormatToolbarProps {
    // Không cần truyền handler phức tạp vì component tự lắng nghe selection change trên toàn document
    // và tự thay đổi style của selection
}

const MIN_FONT_SIZE = 0.5;
const MAX_FONT_SIZE = 80;
const MIN_LINE_HEIGHT = 0.6;
const MAX_LINE_HEIGHT = 3;

const clampFontSize = (size: number): number =>
    Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, parseFloat(size.toFixed(1))));

/** Chữ càng to thì mỗi lần bấm càng phải đổi nhiều mới thấy khác: giá 26,5 mà tăng 0,1 thì gần như không nhận ra. */
const fontSizeStep = (size: number): number => {
    if (size < 10) return 0.2;
    if (size < 20) return 0.5;
    return 1;
};

interface SelectedPiece {
    node: Text;
    start: number;
    end: number;
}

/** Các đoạn chữ đang được chọn, có thể nằm rải trên nhiều dòng của ô. */
const selectedPieces = (range: Range): SelectedPiece[] => {
    const root = range.commonAncestorContainer;
    const candidates: Text[] = [];
    if (root.nodeType === Node.TEXT_NODE) {
        candidates.push(root as Text);
    } else {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) candidates.push(walker.currentNode as Text);
    }
    return candidates
        .filter((node) => range.intersectsNode(node))
        .map((node) => ({
            node,
            start: node === range.startContainer ? range.startOffset : 0,
            end: node === range.endContainer ? range.endOffset : node.length,
        }))
        .filter(({ node, start, end }) => end > start && node.data.slice(start, end).trim() !== '');
};

/** Phông giao diện của app ép lên mọi thẻ span bằng !important, nên phải ép kế thừa thì chữ được bọc mới giữ đúng phông của ô. */
const createInheritingSpan = (): HTMLSpanElement => {
    const span = document.createElement('span');
    span.style.setProperty('font-family', 'inherit', 'important');
    return span;
};

/**
 * Các ô của tem dùng flex: mỗi thẻ con và mỗi đoạn chữ thành một khối riêng nên khoảng trắng hai bên bị mất,
 * "hoà Daikiosan DMI03" dính thành "hoàDaikiosanDMI03". Gom nội dung vào một thẻ duy nhất thì chữ chảy liền như thường.
 */
const keepSpacesInFlexField = (editable: HTMLElement): void => {
    if (!window.getComputedStyle(editable).display.includes('flex')) return;
    // Ô đã chia dòng bằng thẻ div (mẫu phiếu) thì mỗi dòng đã chảy liền sẵn, không cần gom
    const hasLooseText = [...editable.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim());
    if (!hasLooseText) return;
    const wrapper = createInheritingSpan();
    wrapper.append(...editable.childNodes);
    editable.append(wrapper);
};

const withoutSpaces = (text: string | null | undefined): string => (text ?? '').replace(/\s+/g, '');

/** Đổi cỡ chữ px thực tế sang cqw theo khung tem chứa nó, không đoán theo tên ô. */
const toCqw = (element: Element): number | null => {
    const container = element.closest('.sticker-container');
    const fontSize = parseFloat(window.getComputedStyle(element).fontSize);
    if (!container || !container.clientWidth || Number.isNaN(fontSize)) return null;
    return (fontSize / container.clientWidth) * 100;
};

export const FloatingFormatToolbar: React.FC<FloatingFormatToolbarProps> = () => {
    const [toolbarPos, setToolbarPos] = useState<{ top: number; left: number } | null>(null);
    const [activeMenu, setActiveMenu] = useState<'font' | 'size' | null>(null);
    const [fontSizeInput, setFontSizeInput] = useState<string>('3.5');
    const [lineHeightInput, setLineHeightInput] = useState<string>('1.3');

    const savedRangeRef = useRef<Range | null>(null);
    // Ref mirror của activeMenu — dùng trong selectionchange handler để biết dropdown có đang mở hay không.
    const activeMenuRef = useRef<'font' | 'size' | null>(null);
    // Cờ báo người dùng đang focus gõ trong ô input trên toolbar để tránh selectionchange đóng toolbar
    const isTypingRef = useRef<boolean>(false);
    // Ô cỡ chữ đang có số ngoài khoảng cho phép, cần sửa lại khi rời ô
    const fontSizeTypedRef = useRef<boolean>(false);

    // Sync ref khi state thay đổi
    useEffect(() => { activeMenuRef.current = activeMenu; }, [activeMenu]);

    const getEditableContainer = (node: Node | null): HTMLElement | null => {
        let current: Node | null = node;
        while (current) {
            if (current.nodeType === 1 && (current as HTMLElement).getAttribute('contenteditable') === 'true') {
                return current as HTMLElement;
            }
            current = current.parentNode;
        }
        return null;
    };

    /** Phần tử quyết định cỡ chữ đang hiện: ô % giảm tính theo cả ô vì các phần bên trong co giãn theo tỉ lệ. */
    const fontSizeSource = (range: Range): Element | null => {
        const parent = range.commonAncestorContainer;
        const editable = getEditableContainer(parent.nodeType === Node.TEXT_NODE ? parent.parentNode : parent);
        if (!editable) return null;
        if (detectField(editable) === 'percent') return editable;
        return selectedPieces(range)[0]?.node.parentElement ?? editable;
    };

    const getSelectedFontSize = (explicitRange?: Range | null): number => {
        const range = explicitRange || savedRangeRef.current || (window.getSelection()?.rangeCount ? window.getSelection()?.getRangeAt(0) : null);
        const source = range ? fontSizeSource(range) : null;
        return (source && toCqw(source)) ?? 3.5;
    };

    const closestBlock = (node: Node, editable: HTMLElement): HTMLElement => {
        let current = node.parentElement;
        while (current && current !== editable && window.getComputedStyle(current).display.startsWith('inline')) {
            current = current.parentElement;
        }
        return current ?? editable;
    };

    const getSelectedLineHeight = (explicitRange?: Range | null): number => {
        const range = explicitRange || savedRangeRef.current || (window.getSelection()?.rangeCount ? window.getSelection()?.getRangeAt(0) : null);
        if (!range) return 1.3;
        const parent = range.commonAncestorContainer;
        const editable = getEditableContainer(parent.nodeType === Node.TEXT_NODE ? parent.parentNode : parent);
        const first = selectedPieces(range)[0]?.node;
        if (!editable || !first) return 1.3;
        const computed = window.getComputedStyle(closestBlock(first, editable));
        const fs = parseFloat(computed.fontSize);
        const lh = parseFloat(computed.lineHeight);
        // Khoảng dòng "normal" không ra số; trình duyệt thường hiểu xấp xỉ 1,2
        if (Number.isNaN(fs) || Number.isNaN(lh) || fs <= 0) return 1.2;
        return parseFloat((lh / fs).toFixed(2));
    };

    // Gọi lại sau khi đổi cỡ chữ: chữ to lên thì thanh phải đổi chỗ và số hiện phải đúng cỡ thật
    const syncFromSelectionRef = useRef<() => void>(() => undefined);
    const syncTimerRef = useRef<number | undefined>(undefined);
    const scheduleSync = () => {
        window.clearTimeout(syncTimerRef.current);
        syncTimerRef.current = window.setTimeout(() => syncFromSelectionRef.current(), 60);
    };
    useEffect(() => () => window.clearTimeout(syncTimerRef.current), []);

    useEffect(() => {
        const handleSelectionChange = () => {
            if (isTypingRef.current) return;
            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
                if (activeMenuRef.current) return;
                setToolbarPos(null);
                setActiveMenu(null);
                return;
            }

            const range = selection.getRangeAt(0);
            
            let parent = range.commonAncestorContainer;
            if (parent.nodeType === 3) parent = parent.parentNode || parent;
            const editableEl = getEditableContainer(parent);

            if (!editableEl) {
                if (activeMenuRef.current) return;
                setToolbarPos(null);
                setActiveMenu(null);
                return;
            }

            // Cache range
            savedRangeRef.current = range.cloneRange();

            // Cập nhật giá trị hiển thị trên toolbar
            const fs = getSelectedFontSize(range);
            setFontSizeInput(fs.toFixed(1));
            const lh = getSelectedLineHeight(range);
            setLineHeightInput(lh.toFixed(2));

            const rects = range.getClientRects();
            if (rects.length > 0) {
                const rect = rects[0];
                const containerRect = editableEl.getBoundingClientRect();
                const anchorTop = Math.min(Math.max(rect.top, containerRect.top), containerRect.bottom);
                const anchorLeft = Math.min(Math.max(rect.left + rect.width / 2, containerRect.left), containerRect.right);
                setToolbarPos({
                    top: Math.max(8, anchorTop - 50),
                    left: anchorLeft,
                });
            } else {
                if (activeMenuRef.current) return;
                setToolbarPos(null);
                setActiveMenu(null);
            }
        };

        syncFromSelectionRef.current = handleSelectionChange;
        document.addEventListener('selectionchange', handleSelectionChange);
        return () => {
            document.removeEventListener('selectionchange', handleSelectionChange);
        };
    }, []);

    const applyStyleToSelection = (styleName: 'fontSize' | 'fontFamily', styleValue: string, refocus: boolean = true) => {
        let range = savedRangeRef.current;
        const selection = window.getSelection();
        
        if (!range && selection && selection.rangeCount > 0) {
            range = selection.getRangeAt(0);
        }

        if (!range) return;

        let parent = range.commonAncestorContainer;
        if (parent.nodeType === 3) parent = parent.parentNode || parent;
        const editableContainer = getEditableContainer(parent);

        if (!editableContainer) return;

        // Chỉ focus lại container soạn thảo nếu không phải đang gõ trong ô input trên toolbar
        if (refocus) {
            editableContainer.focus();
        }

        let cleanValue = styleValue;
        if (styleName === 'fontFamily') {
            cleanValue = styleValue.replace(/['"]/g, '');
        }

        const styleProp = styleName === 'fontFamily' ? 'font-family' : 'font-size';
        const selectedText = range.toString();

        if (range.collapsed) {
            try {
                const currentHTML = editableContainer.innerHTML;
                const propName = styleName === 'fontFamily' ? 'font-family' : 'font-size';
                editableContainer.innerHTML = `<span style="${propName}: ${styleValue}">${currentHTML}</span>`;
                
                const event = new Event('input', { bubbles: true });
                editableContainer.dispatchEvent(event);
                
                const newRange = document.createRange();
                newRange.selectNodeContents(editableContainer);
                if (selection && refocus) {
                    selection.removeAllRanges();
                    selection.addRange(newRange);
                }
                savedRangeRef.current = newRange;
                return;
            } catch (e) {
                console.error('Error applying custom style to container:', e);
            }
        }

        let startEl: HTMLElement | null = range.commonAncestorContainer.nodeType === 3
            ? range.commonAncestorContainer.parentElement
            : range.commonAncestorContainer as HTMLElement;
        const innerMatch = startEl?.closest(`span[style*="${styleProp}"]`) as HTMLElement | null;

        // Nếu span hiện tại bao quanh toàn bộ vùng chọn, chỉ cần cập nhật style của nó
        // và dọn dẹp các span con lồng bên trong
        if (innerMatch && editableContainer.contains(innerMatch) && (
            innerMatch.textContent?.trim() === selectedText.trim() || 
            innerMatch === range.commonAncestorContainer
        )) {
            innerMatch.style[styleName] = cleanValue;

            // Xoá styleProp khỏi tất cả span con lồng bên trong để tránh conflict CSS
            innerMatch.querySelectorAll(`span[style*="${styleProp}"]`).forEach(child => {
                (child as HTMLElement).style.removeProperty(styleProp);
            });

            // Gỡ các span cha cùng styleProp thừa nếu có
            let ancestor = innerMatch.parentElement;
            while (
                ancestor && ancestor !== editableContainer && ancestor.tagName === 'SPAN' &&
                ancestor.style.getPropertyValue(styleProp) && ancestor.textContent?.trim() === selectedText.trim()
            ) {
                const toRemove = ancestor;
                ancestor = ancestor.parentElement;
                const p = toRemove.parentNode;
                if (p) {
                    while (toRemove.firstChild) p.insertBefore(toRemove.firstChild, toRemove);
                    p.removeChild(toRemove);
                }
            }

            const flatRange = document.createRange();
            flatRange.selectNodeContents(innerMatch);
            if (selection && refocus) {
                selection.removeAllRanges();
                selection.addRange(flatRange);
            }
            savedRangeRef.current = flatRange;

            const flatEvent = new Event('input', { bubbles: true });
            editableContainer.dispatchEvent(flatEvent);
            return;
        }

        // Trường hợp wrap vùng chọn vào span mới:
        if (selection && refocus) {
            selection.removeAllRanges();
            selection.addRange(range);
        }

        const span = document.createElement('span');
        span.style[styleName] = cleanValue;

        try {
            const fragment = range.extractContents();
            // CỰC KỲ QUAN TRỌNG: Dọn sạch mọi span lồng có cùng styleProp bên trong fragment!
            // Tránh việc span con (vd font-size: 0.5cqw) ghi đè lên span cha mới (font-size: 0.6cqw)
            fragment.querySelectorAll(`span[style*="${styleProp}"]`).forEach(child => {
                (child as HTMLElement).style.removeProperty(styleProp);
            });

            span.appendChild(fragment);
            range.insertNode(span);
            
            // Dọn dẹp bất kỳ span rỗng nào trong container
            editableContainer.querySelectorAll('span').forEach(s => {
                if ((!s.getAttribute('style') || s.getAttribute('style')?.trim() === '') && s.childNodes.length === 0) {
                    s.remove();
                }
            });

            const newRange = document.createRange();
            newRange.selectNodeContents(span);
            if (selection && refocus) {
                selection.removeAllRanges();
                selection.addRange(newRange);
            }
            savedRangeRef.current = newRange;

            const event = new Event('input', { bubbles: true });
            editableContainer.dispatchEvent(event);
        } catch (e) {
            console.error('Error applying custom style to selection:', e);
        }
    };

    const handleFormat = (command: string) => {
        let range = savedRangeRef.current;
        const selection = window.getSelection();
        
        if (range && selection) {
            selection.removeAllRanges();
            selection.addRange(range);
        }

        document.execCommand(command, false);
        
        if (selection && selection.rangeCount > 0) {
            savedRangeRef.current = selection.getRangeAt(0).cloneRange();
        }

        const newSelection = window.getSelection();
        if (!newSelection || newSelection.rangeCount === 0) return;
        const newRange = newSelection.getRangeAt(0);
        let parent = newRange.commonAncestorContainer;
        if (parent.nodeType === 3) parent = parent.parentNode || parent;
        const editableContainer = getEditableContainer(parent);
        if (editableContainer) {
            const event = new Event('input', { bubbles: true });
            editableContainer.dispatchEvent(event);
        }
    };

    /** Vùng chọn đang dùng, chỉ nhận khi vẫn còn nằm trong một ô đang hiện trên màn hình. */
    const currentSelection = (): { range: Range; editable: HTMLElement } | null => {
        const selection = window.getSelection();
        const range = savedRangeRef.current ?? (selection?.rangeCount ? selection.getRangeAt(0) : null);
        if (!range) return null;
        const parent = range.commonAncestorContainer;
        const editable = getEditableContainer(parent.nodeType === Node.TEXT_NODE ? parent.parentNode : parent);
        if (!editable?.isConnected) return null;
        return { range, editable };
    };

    const selectRange = (range: Range) => {
        savedRangeRef.current = range;
        const selection = window.getSelection();
        if (selection && !isTypingRef.current) {
            selection.removeAllRanges();
            selection.addRange(range);
        }
    };

    const notifyContentChanged = (editable: HTMLElement) => {
        editable.dispatchEvent(new Event('input', { bubbles: true }));
    };

    const emitFieldSize = (field: StickerFieldName, size: number) => {
        document.dispatchEvent(new CustomEvent<FieldSizeChange>(FIELD_SIZE_EVENT, { detail: { field, size } }));
    };

    /** Đổi cỡ cho đúng các đoạn đang chọn. Làm trên từng đoạn chữ nên chọn qua nhiều dòng vẫn nhận, dòng nào giữ tỉ lệ dòng đó. */
    const resizePieces = (range: Range, editable: HTMLElement, nextSize: (current: number) => number): void => {
        const pieces = selectedPieces(range).map((piece) => ({
            ...piece,
            size: nextSize(toCqw(piece.node.parentElement as Element) ?? 3.5),
        }));
        keepSpacesInFlexField(editable);
        const wrappers: HTMLElement[] = [];
        for (const { node, start, end, size } of pieces) {
            const parent = node.parentElement as HTMLElement;
            if (start === 0 && end === node.length && parent.tagName === 'SPAN' && parent.childNodes.length === 1) {
                parent.style.fontSize = `${size}cqw`;
                wrappers.push(parent);
                continue;
            }
            if (end < node.length) node.splitText(end);
            const target = start > 0 ? node.splitText(start) : node;
            const span = createInheritingSpan();
            span.style.fontSize = `${size}cqw`;
            target.parentNode?.insertBefore(span, target);
            span.appendChild(target);
            wrappers.push(span);
        }
        if (wrappers.length === 0) return;
        const next = document.createRange();
        next.setStartBefore(wrappers[0]);
        next.setEndAfter(wrappers[wrappers.length - 1]);
        selectRange(next);
    };

    const applyFontSize = (nextSize: (current: number) => number) => {
        const current = currentSelection();
        if (!current) return;
        const { range, editable } = current;
        if (!isTypingRef.current) editable.focus();

        const field = detectField(editable);
        const coversWholeField = withoutSpaces(range.toString()) === withoutSpaces(editable.textContent);
        const hasInnerSizes = Boolean(editable.querySelector('[style*="font-size"]'));
        // Tem lưu nội dung dạng chữ thuần nên chỉ cỡ của cả ô mới được lưu lại và in đúng ở mọi nơi.
        // Ô % giảm do app tự vẽ lại theo giá nên không được chèn thẻ vào trong. Ô phiếu có cỡ riêng từng dòng thì giữ tỉ lệ các dòng.
        const useFieldSize = field && (field === 'percent' || (coversWholeField && (!isDrawField(field) || !hasInnerSizes)));

        if (useFieldSize) {
            const size = nextSize(toCqw(editable) ?? DEFAULT_FIELD_SIZES[field]);
            if (!isDrawField(field)) {
                editable.querySelectorAll<HTMLElement>('[style*="font-size"]').forEach((el) => el.style.removeProperty('font-size'));
            }
            emitFieldSize(field, size);
        } else {
            resizePieces(range, editable, nextSize);
        }

        notifyContentChanged(editable);
        scheduleSync();
    };

    const adjustFontSize = (direction: 1 | -1) => {
        const parsed = parseFloat(fontSizeInput);
        const shown = (!Number.isNaN(parsed) && parsed > 0) ? parsed : getSelectedFontSize();
        const delta = direction * fontSizeStep(shown);
        setFontSizeInput(clampFontSize(shown + delta).toFixed(1));
        applyFontSize((size) => clampFontSize(size + delta));
    };

    /** Đưa ô đang chọn về đúng cỡ chữ và khoảng dòng mặc định. */
    const resetCurrentField = () => {
        const current = currentSelection();
        if (!current) return;
        const { editable } = current;
        const field = detectField(editable);
        editable.focus();
        resetFieldFormatting(editable, field);
        if (field) emitFieldSize(field, DEFAULT_FIELD_SIZES[field]);
        const whole = document.createRange();
        whole.selectNodeContents(editable);
        selectRange(whole);
        notifyContentChanged(editable);
        scheduleSync();
    };

    // --- Line Height ---
    // Khoảng dòng là thuộc tính của cả dòng, đặt trên thẻ span nằm trong dòng thì giảm không có tác dụng.
    const applyLineHeightToSelection = (value: string) => {
        const current = currentSelection();
        if (!current) return;
        const { range, editable } = current;
        if (!isTypingRef.current) editable.focus();

        const blocks = new Set(selectedPieces(range).map(({ node }) => closestBlock(node, editable)));
        const field = detectField(editable);
        for (const block of blocks) {
            let target = block;
            // Bản in phiếu chỉ lấy nội dung trong ô, nên ô chưa có dòng riêng thì phải bọc thêm một dòng mới lưu và in được
            if (block === editable && isDrawField(field)) {
                target = document.createElement('div');
                target.append(...editable.childNodes);
                editable.append(target);
            }
            target.style.lineHeight = value;
            target.querySelectorAll<HTMLElement>('[style*="line-height"]').forEach((el) => el.style.removeProperty('line-height'));
        }
        notifyContentChanged(editable);
        scheduleSync();
    };

    const adjustLineHeight = (amount: number) => {
        const parsed = parseFloat(lineHeightInput);
        const current = (!Number.isNaN(parsed) && parsed > 0) ? parsed : getSelectedLineHeight();
        const newVal = Math.max(MIN_LINE_HEIGHT, Math.min(MAX_LINE_HEIGHT, parseFloat((current + amount).toFixed(2))));
        setLineHeightInput(newVal.toFixed(2));
        applyLineHeightToSelection(String(newVal));
    };

    const handleFontSizeInputChange = (valStr: string) => {
        setFontSizeInput(valStr);
        const val = parseFloat(valStr);
        if (!Number.isNaN(val) && val >= MIN_FONT_SIZE && val <= MAX_FONT_SIZE) {
            fontSizeTypedRef.current = false;
            applyFontSize(() => clampFontSize(val));
        } else {
            fontSizeTypedRef.current = true;
        }
    };

    const handleFontSizeBlur = () => {
        // Bấm vào ô rồi bỏ đi mà không gõ gì thì không được đổi chữ. Chỉ sửa lại khi vừa gõ số ngoài khoảng cho phép.
        const val = parseFloat(fontSizeInput);
        if (fontSizeTypedRef.current) {
            fontSizeTypedRef.current = false;
            if (!Number.isNaN(val)) applyFontSize(() => clampFontSize(val));
        }
        isTypingRef.current = false;
        scheduleSync();
    };

    const handleLineHeightInputChange = (valStr: string) => {
        setLineHeightInput(valStr);
        const val = parseFloat(valStr);
        if (!Number.isNaN(val) && val >= MIN_LINE_HEIGHT && val <= MAX_LINE_HEIGHT) {
            applyLineHeightToSelection(String(val));
        }
    };

    const handleLineHeightBlur = () => {
        isTypingRef.current = false;
        scheduleSync();
    };

    const showDropdownBelow = toolbarPos ? (toolbarPos.top - window.scrollY < 180) : false;

    if (!toolbarPos) return null;

    return (
        <div 
            className="fixed z-[9999] -translate-x-1/2 flex items-center gap-1 bg-slate-900/95 dark:bg-slate-950/95 border border-slate-700/60 p-1.5 rounded-control shadow-xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-150 print:hidden"
            style={{ 
                top: `${toolbarPos.top}px`, 
                left: `${toolbarPos.left}px` 
            }}
            onMouseDown={(e) => {
                e.preventDefault();
            }}
        >
            {/* Font Custom Dropdown */}
            <div className="relative">
                <Button
                    variant="ghost"
                    size="sm"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setActiveMenu(activeMenu === 'font' ? null : 'font')}
                    className="text-white text-[11px] font-semibold px-2 py-1 hover:bg-slate-800 flex items-center gap-1 border-r border-slate-700/80 mr-0.5"
                >
                    Font <span className="text-[11px] opacity-75">▼</span>
                </Button>
                
                {activeMenu === 'font' && (
                    <div 
                        onMouseDown={(e) => e.preventDefault()}
                        className={`absolute left-0 mb-2 bg-slate-950 border border-slate-800 rounded-control shadow-2xl py-1 flex flex-col min-w-[150px] max-h-[200px] overflow-y-auto z-[10000] scrollbar-thin overflow-x-hidden ${
                            showDropdownBelow ? 'top-full mt-2' : 'bottom-full mb-2'
                        }`}
                    >
                        {[
                            { name: 'UTM Avo', val: "UTM Avo, sans-serif" },
                            { name: 'Plus Jakarta Sans', val: "Plus Jakarta Sans, sans-serif" },
                            { name: 'Inter', val: "Inter, sans-serif" },
                            { name: 'Oswald', val: "Oswald, sans-serif" },
                            { name: 'Roboto Condensed', val: "Roboto Condensed, sans-serif" },
                            { name: 'Fjalla One', val: "Fjalla One, sans-serif" },
                            { name: 'Jost', val: "Jost, sans-serif" },
                            { name: 'Josefin Sans', val: "Josefin Sans, sans-serif" },
                            { name: 'Alata Regular', val: "Alata Regular, sans-serif" },
                            { name: 'Shopee Text', val: "Shopee Text, sans-serif" },
                            { name: 'SF Pro Display', val: "SF Pro Display, sans-serif" },
                            { name: 'Samsung Sharp Sans', val: "Samsung Sharp Sans, sans-serif" },
                            { name: 'Shopee Display', val: "Shopee Display, sans-serif" },
                            { name: 'UTM Colossalis', val: "UTM Colossalis, sans-serif" }
                        ].map(font => (
                            <Button
                                variant="ghost"
                                size="sm"
                                key={font.val}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                    applyStyleToSelection('fontFamily', font.val);
                                    setActiveMenu(null);
                                }}
                                className="justify-start px-3 py-1.5 text-left text-[11px] text-slate-200 hover:text-white hover:bg-slate-800 w-full whitespace-nowrap"
                                style={{ fontFamily: font.val }}
                            >
                                {font.name}
                            </Button>
                        ))}
                    </div>
                )}
            </div>

            {/* Size adjust controls: - [input] + */}
            <div className="flex items-center gap-1 bg-slate-800/80 rounded px-1.5 py-0.5 border border-slate-700/50 mr-1 no-print">
                <Button
                    variant="secondary"
                    size="none"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => adjustFontSize(-1)}
                    className="w-5 h-5 flex items-center justify-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500 text-white rounded text-xs font-black"
                    title="Giảm size chữ"
                    aria-label="Giảm size chữ"
                >
                    -
                </Button>
                <Input
                    dense
                    fullWidth={false}
                    type="text"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    onFocus={() => { isTypingRef.current = true; }}
                    value={fontSizeInput}
                    onChange={(e) => handleFontSizeInputChange(e.target.value)}
                    onBlur={handleFontSizeBlur}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            (e.target as HTMLInputElement).blur();
                        }
                    }}
                    className="w-9 h-5 px-0 text-center text-[11px] font-bold text-white bg-slate-900 border-slate-700 rounded-sm focus-visible:border-rose-500 focus-visible:ring-rose-500"
                    title="Cỡ chữ (gõ số hoặc dùng +/-)"
                    aria-label="Cỡ chữ"
                />
                <Button
                    variant="secondary"
                    size="none"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => adjustFontSize(1)}
                    className="w-5 h-5 flex items-center justify-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500 text-white rounded text-xs font-black"
                    title="Tăng size chữ"
                    aria-label="Tăng size chữ"
                >
                    +
                </Button>
            </div>

            {/* Line Height controls: ↕ - [value] + */}
            <div className="flex items-center gap-1 bg-slate-800/80 rounded px-1.5 py-0.5 border border-slate-700/50 mr-1 no-print">
                <span className="text-[11px] text-slate-400 font-bold select-none" title="Khoảng cách dòng">↕</span>
                <Button
                    variant="secondary"
                    size="none"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => adjustLineHeight(-0.05)}
                    className="w-5 h-5 flex items-center justify-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500 text-white rounded text-xs font-black"
                    title="Giảm khoảng cách dòng"
                    aria-label="Giảm khoảng cách dòng"
                >
                    -
                </Button>
                <Input
                    dense
                    fullWidth={false}
                    type="text"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    onFocus={() => { isTypingRef.current = true; }}
                    value={lineHeightInput}
                    onChange={(e) => handleLineHeightInputChange(e.target.value)}
                    onBlur={handleLineHeightBlur}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            (e.target as HTMLInputElement).blur();
                        }
                    }}
                    className="w-10 h-5 px-0 text-center text-[11px] font-bold text-white bg-slate-900 border-slate-700 rounded-sm focus-visible:border-rose-500 focus-visible:ring-rose-500"
                    title="Khoảng cách dòng (gõ số hoặc dùng +/-)"
                    aria-label="Khoảng cách dòng"
                />
                <Button
                    variant="secondary"
                    size="none"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => adjustLineHeight(0.05)}
                    className="w-5 h-5 flex items-center justify-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500 text-white rounded text-xs font-black"
                    title="Tăng khoảng cách dòng"
                    aria-label="Tăng khoảng cách dòng"
                >
                    +
                </Button>
            </div>

            {/* Về cỡ chữ và khoảng dòng mặc định của ô đang chọn */}
            <Button
                variant="ghost"
                size="icon"
                icon="reset"
                onMouseDown={(e) => e.preventDefault()}
                onClick={resetCurrentField}
                className="p-1 text-slate-300 hover:text-white hover:bg-slate-800"
                title="Khôi phục cỡ chữ và khoảng dòng mặc định của ô này"
                aria-label="Khôi phục cỡ chữ mặc định của ô này"
            />

            {/* Bold button */}
            <Button
                variant="ghost"
                size="icon"
                icon="textBold"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleFormat('bold')}
                className="p-1 text-slate-300 hover:text-white hover:bg-slate-800"
                title="In đậm (Bold)"
                aria-label="In đậm (Bold)"
            />

            {/* Italic button */}
            <Button
                variant="ghost"
                size="icon"
                icon="textItalic"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleFormat('italic')}
                className="p-1 text-slate-300 hover:text-white hover:bg-slate-800"
                title="In nghiêng (Italic)"
                aria-label="In nghiêng (Italic)"
            />

            {/* Underline button */}
            <Button
                variant="ghost"
                size="icon"
                icon="textUnderline"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleFormat('underline')}
                className="p-1 text-slate-300 hover:text-white hover:bg-slate-800"
                title="Gạch chân (Underline)"
                aria-label="Gạch chân (Underline)"
            />

            {/* Tooltip arrow */}
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-full w-0 h-0 border-x-[5px] border-x-transparent border-t-[5px] border-t-slate-900/95" />
        </div>
    );
};
