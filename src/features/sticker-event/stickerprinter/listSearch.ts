/** Bỏ dấu và chữ hoa để tìm tên danh sách: "may loc" tìm được "MÁY LỌC NƯỚC". */
export const searchKey = (text: string): string =>
    text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim();
