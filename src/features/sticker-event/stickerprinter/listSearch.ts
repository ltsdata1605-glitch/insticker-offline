/** Bỏ dấu và chữ hoa để tìm tên danh sách: "may loc" tìm được "MÁY LỌC NƯỚC". */
export const searchKey = (text: string): string =>
    text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim();

/** Sticker khớp ô tìm: mọi từ gõ vào đều có trong tên hoặc mã, không cần dấu. Ô trống thì khớp hết. */
export const matchesSticker = (page: { label?: string; code?: string }, query: string): boolean => {
    const words = searchKey(query).split(/\s+/).filter(Boolean);
    if (words.length === 0) return true;
    const haystack = searchKey(`${page.label ?? ''} ${page.code ?? ''}`);
    return words.every((word) => haystack.includes(word));
};
