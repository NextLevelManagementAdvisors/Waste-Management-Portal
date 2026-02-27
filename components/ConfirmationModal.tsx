import React from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import {ExclamationTriangleIcon} from "./Icons.tsx";

interface ConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({ isOpen, onClose, onConfirm, title, message }) => {
    if (!isOpen) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose}>
            <div className="p-6">
                <div className="text-center">
                    <ExclamationTriangleIcon className="w-12 h-12 text-red-500 mx-auto mb-4" />
                    <h3 className="text-xl font-bold text-neutral">{title}</h3>
                    <p className="text-gray-600 mt-2">{message}</p>
                </div>
                <div className="mt-8 flex justify-center gap-4">
                    <Button onClick={onConfirm} className="bg-red-500 hover:bg-red-600 focus:ring-red-500 rounded-xl px-8 font-black uppercase tracking-widest text-xs h-14">
                        Confirm
                    </Button>
                    <Button onClick={onClose} className="bg-gray-200 hover:bg-gray-300 focus:ring-gray-200 text-gray-800 rounded-xl px-8 font-black uppercase tracking-widest text-xs h-14">
                        Cancel
                    </Button>
                </div>
            </div>
        </Modal>
    );
};