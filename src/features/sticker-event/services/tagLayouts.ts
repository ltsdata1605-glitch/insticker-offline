import type { TagLayout } from '../types';

/** Bố cục trang A4, dùng chung cho hộp chọn bố cục khi in và file mẫu của tab Sticker. */
export const TAG_LAYOUTS: readonly { value: TagLayout; label: string; description: string }[] = [
  { value: 1, label: '1 Sticker / Trang', description: 'CE, QĐH, Quạt lớn, MLN' },
  { value: 2, label: '2 Sticker / Trang', description: 'Bộ lau nhà, Bếp đôi, Lò vi sóng, Lò nướng' },
  { value: 4, label: '4 Sticker / Trang', description: 'Nồi cơm, Nồi chiên, Bếp đơn, Nồi, Quạt nhỏ' },
  { value: 8, label: '8 Sticker / Trang', description: 'Máy sấy tóc, bàn ủi, bình đun, Máy xay sinh tố, vợt muỗi, thớt' },
  { value: 16, label: '16 Sticker / Trang', description: 'Camera, DCNB,Chảo, bình giữ nhiệt, rổ, thao' },
  { value: 24, label: '24 Sticker / Trang', description: 'Phụ kiện, SDP, dao, kéo, đũa' },
];

export const DEFAULT_TAG_LAYOUT: TagLayout = 4;

export const isTagLayout = (value: unknown): value is TagLayout => TAG_LAYOUTS.some((layout) => layout.value === value);

export interface LayoutGroup<T> {
  layout: TagLayout;
  items: T[];
}

/** Chia sản phẩm theo bố cục, bố cục ít sticker/trang trước. Giữ thứ tự sản phẩm trong từng nhóm. */
export const groupByLayout = <T extends { layout?: TagLayout }>(items: readonly T[]): LayoutGroup<T>[] => {
  const groups = new Map<TagLayout, T[]>();
  for (const item of items) {
    const layout = item.layout ?? DEFAULT_TAG_LAYOUT;
    const group = groups.get(layout);
    if (group) group.push(item);
    else groups.set(layout, [item]);
  }
  return [...groups.entries()].sort(([a], [b]) => a - b).map(([layout, groupItems]) => ({ layout, items: groupItems }));
};
