import React, { useState, useEffect } from 'react';
import { AppIcon } from '../../components/shared/ui/icon/AppIcon';
import { SavedList, SavedListItem } from './types';
import { fetchSavedLists, deleteSavedList } from './services/localDataService';
import { useStickerScope } from './services/scope';
import ConfirmModal from './ConfirmModal';
import AlertModal from './AlertModal';
import { Button } from '../../components/shared/ui/Button';
import { Modal } from '../../components/shared/ui/Modal';
import { EmptyState } from '../../components/shared/ui/EmptyState';

interface SavedListsModalProps {
    onClose: () => void;
    onLoadList: (items: SavedListItem[]) => void;
}

const SavedListsModal: React.FC<SavedListsModalProps> = ({ onClose, onLoadList }) => {
    const scope = useStickerScope();
    const [lists, setLists] = useState<SavedList[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [listToDelete, setListToDelete] = useState<SavedList | null>(null);
    const [alertConfig, setAlertConfig] = useState<{ isOpen: boolean; message: string }>({
        isOpen: false,
        message: ''
    });

    useEffect(() => {
        loadLists();
    }, []);

    const loadLists = async () => {
        setIsLoading(true);
        setError(null);
        try {
            setLists(await fetchSavedLists(scope));
        } catch (err) {
            setError('Lỗi khi tải danh sách đã lưu.');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleOpenList = (list: SavedList) => {
        onLoadList(list.items);
        onClose();
    };

    const handleDelete = (list: SavedList) => {
        setListToDelete(list);
        setIsConfirmOpen(true);
    };

    const executeDelete = async () => {
        if (!listToDelete) return;

        try {
            await deleteSavedList(listToDelete.id, scope);
            setLists(lists.filter(l => l.id !== listToDelete.id));
        } catch (err) {
            setAlertConfig({ isOpen: true, message: 'Lỗi khi xóa danh sách.' });
            console.error(err);
        } finally {
            setListToDelete(null);
        }
    };

    return (
        <Modal
            isOpen={true}
            onClose={onClose}
            title="Danh sách đã lưu"
            titleColorClass="text-slate-900"
            maxWidth="lg"
        >
            <div className="space-y-6 flex flex-col h-full">
                {error && (
                    <div className="bg-rose-50 text-rose-600 p-3 rounded-md text-sm">
                        {error}
                    </div>
                )}

                <div className="flex-1 overflow-y-auto min-h-[300px]">
                    {isLoading ? (
                        <div className="flex justify-center items-center h-full">
                            <div className="w-8 h-8 border-4 border-sky-200 border-t-indigo-600 rounded-full animate-spin"></div>
                        </div>
                    ) : lists.length === 0 ? (
                        <div className="flex items-center justify-center h-full">
                            <EmptyState icon={<AppIcon name="exportBatch" size="xl" />} title="Chưa có danh sách nào được lưu" />
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {lists.map(list => (
                                <div key={list.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-popup border border-slate-200 hover:border-sky-300 transition-colors">
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-base font-semibold text-slate-800 truncate">{list.name}</h3>
                                        <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                                            <span>{new Date(list.createdAt).toLocaleString('vi-VN')}</span>
                                            <span>•</span>
                                            <span>{list.totalItems} sản phẩm</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 ml-4">
                                        <Button
                                            variant="tinted"
                                            size="sm"
                                            onClick={() => handleOpenList(list)}
                                        >
                                            Mở
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => handleDelete(list)}
                                            icon="delete"
                                            title="Xóa danh sách"
                                            aria-label="Xóa danh sách"
                                            className="text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

            </div>

            <ConfirmModal
                isOpen={isConfirmOpen}
                onClose={() => setIsConfirmOpen(false)}
                onConfirm={executeDelete}
                message="Bạn có chắc chắn muốn xóa danh sách này?"
                title="Xác nhận xóa"
                confirmText="Xóa"
                type="danger"
            />

            <AlertModal
                isOpen={alertConfig.isOpen}
                onClose={() => setAlertConfig({ ...alertConfig, isOpen: false })}
                message={alertConfig.message}
            />
        </Modal>
    );
};

export default SavedListsModal;
