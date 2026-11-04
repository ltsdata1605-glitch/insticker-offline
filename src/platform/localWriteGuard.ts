/**
 * Khi khôi phục từ file sao lưu, app ghi dữ liệu mới rồi tải lại trang. Ngay lúc tải lại, các màn hình tự lưu
 * trạng thái đang có trong bộ nhớ (sự kiện beforeunload, bộ đếm trễ), tức dữ liệu cũ, và có thể ghi đè lên dữ liệu
 * vừa khôi phục. Vì vậy phải khoá mọi lượt tự lưu từ trước khi khôi phục cho tới khi trang tải lại.
 */
let frozen = false;

/** Đánh dấu lượt ghi của chính bước khôi phục, được đi qua khoá. */
export const RESTORE_SOURCE = 'khoi-phuc';

export const freezeLocalWrites = (): void => {
  frozen = true;
};

export const unfreezeLocalWrites = (): void => {
  frozen = false;
};

export const areLocalWritesFrozen = (): boolean => frozen;
