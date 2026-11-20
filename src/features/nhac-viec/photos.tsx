import React, { useEffect, useRef, useState } from 'react';
import { Modal } from '../../components/shared/ui/Modal';
import { Button } from '../../components/shared/ui/Button';

const MAX_SIDE = 1280;

/** Thu nhỏ ảnh về cạnh dài 1280 px, lưu JPEG để kho dữ liệu và file sao lưu không phình. */
export const compressImage = (source: Blob | string): Promise<string> => new Promise((resolve, reject) => {
    const url = typeof source === 'string' ? source : URL.createObjectURL(source);
    const img = new Image();
    img.onload = () => {
        const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.naturalWidth * scale);
        canvas.height = Math.round(img.naturalHeight * scale);
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
        if (typeof source !== 'string') URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => reject(new Error('Không đọc được ảnh'));
    img.src = url;
});

/** Chụp ảnh bằng camera của máy. */
export const CameraCapture: React.FC<{ onCapture: (dataUrl: string) => void; onClose: () => void }> = ({ onCapture, onClose }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [error, setError] = useState('');
    const streamRef = useRef<MediaStream | null>(null);

    useEffect(() => {
        let cancelled = false;
        navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 } }, audio: false })
            .then(stream => {
                if (cancelled) {
                    stream.getTracks().forEach(track => track.stop());
                    return;
                }
                streamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    void videoRef.current.play();
                }
            })
            .catch(() => setError('Không mở được camera. Hãy cho phép app dùng camera trong cài đặt quyền riêng tư của máy.'));
        return () => {
            cancelled = true;
            streamRef.current?.getTracks().forEach(track => track.stop());
        };
    }, []);

    const capture = async () => {
        const video = videoRef.current;
        if (!video || !video.videoWidth) return;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d')!.drawImage(video, 0, 0);
        onCapture(await compressImage(canvas.toDataURL('image/jpeg', 0.9)));
    };

    return (
        <Modal isOpen={true} onClose={onClose} title="Chụp ảnh" maxWidth="lg" zIndex="z-[220]"
            footer={<div className="flex w-full justify-end gap-2"><Button variant="secondary" onClick={onClose}>Huỷ</Button><Button icon="takePhoto" onClick={() => void capture()} disabled={Boolean(error)}>Chụp</Button></div>}>
            {error ? <p className="rounded-control bg-rose-50 px-3 py-2 text-[13px] text-rose-700">{error}</p>
                : <video ref={videoRef} muted playsInline className="w-full rounded-control bg-slate-900 aspect-video object-cover" />}
        </Modal>
    );
};
