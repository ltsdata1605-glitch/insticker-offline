// App chỉ có một màn In Sticker nên không cần LayoutContext đầy đủ của dashboard.
// Giữ đúng tên hook để code sticker chép sang không phải đổi.
export const useActiveTab = () => ({ activeTab: 'tools-print-sticker' });
