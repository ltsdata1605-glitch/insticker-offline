import React from 'react';
import ProductToolbar, { SortField, SortDirection } from './ProductToolbar';
import { Button } from '../../components/shared/ui/Button';
import { Modal } from '../../components/shared/ui/Modal';

interface FilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  sortField?: SortField;
  sortDirection?: SortDirection;
  onSortChange?: (field: SortField, direction: SortDirection) => void;
}

const FilterModal: React.FC<FilterModalProps> = ({ isOpen, onClose, sortField, sortDirection, onSortChange }) => (
  <Modal
    isOpen={isOpen}
    onClose={onClose}
    title="Sắp xếp"
    titleColorClass="text-slate-900"
    maxWidth="lg"
    footer={
      <div className="flex justify-end">
        <Button variant="primary" onClick={onClose}>Xong</Button>
      </div>
    }
  >
    <ProductToolbar sortField={sortField} sortDirection={sortDirection} onSortChange={onSortChange} />
  </Modal>
);

export default FilterModal;
