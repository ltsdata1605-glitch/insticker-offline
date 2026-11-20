import React, { useId, useState } from 'react';
import { Button, Input, Switch, toast } from '../../components/shared/ui';
import { Modal } from '../../components/shared/ui/Modal';
import {
    LOCKABLE_TABS,
    MIN_TAB_PASSWORD_LENGTH,
    changeTabPassword,
    checkTabPassword,
    setTabHidden,
    useHiddenTabs,
} from './tabAccess';

const FORGOT_NOTE = 'Quên mật khẩu thì không có cách lấy lại: phải xoá ứng dụng cùng dữ liệu của ứng dụng rồi cài đặt lại.';

/** Bước nhập mật khẩu. Đúng mật khẩu mới thấy bảng bật tắt tab. */
const PasswordStep: React.FC<{ onUnlocked: () => void }> = ({ onUnlocked }) => {
    const id = useId();
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [checking, setChecking] = useState(false);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setChecking(true);
        const ok = await checkTabPassword(password);
        setChecking(false);
        if (ok) {
            onUnlocked();
        } else {
            setError('Sai mật khẩu.');
            setPassword('');
        }
    };

    return (
        <form onSubmit={submit} className="space-y-3">
            <label className="flex flex-col gap-1.5" htmlFor={`${id}-password`}>
                <span className="text-sm font-semibold text-slate-700">Mật khẩu</span>
                <Input
                    id={`${id}-password`}
                    type="password"
                    autoFocus
                    autoComplete="off"
                    value={password}
                    onChange={(e) => {
                        setPassword(e.target.value);
                        setError('');
                    }}
                />
            </label>
            {error && <p role="alert" className="text-sm font-semibold text-rose-600">{error}</p>}
            <p className="text-xs text-slate-500">{FORGOT_NOTE}</p>
            <div className="flex justify-end">
                <Button type="submit" disabled={!password || checking}>Mở</Button>
            </div>
        </form>
    );
};

/** Bật tắt từng tab và đổi mật khẩu. */
const ControlStep: React.FC = () => {
    const id = useId();
    const hidden = useHiddenTabs();
    const [next, setNext] = useState('');
    const [confirm, setConfirm] = useState('');
    const [error, setError] = useState('');

    const savePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (next.length < MIN_TAB_PASSWORD_LENGTH) {
            setError(`Mật khẩu mới cần ít nhất ${MIN_TAB_PASSWORD_LENGTH} ký tự.`);
            return;
        }
        if (next !== confirm) {
            setError('Hai lần nhập mật khẩu mới không giống nhau.');
            return;
        }
        try {
            await changeTabPassword(next);
        } catch {
            setError('Không lưu được mật khẩu mới. Vui lòng thử lại.');
            return;
        }
        setNext('');
        setConfirm('');
        setError('');
        toast.success('Đã đổi mật khẩu. Nhớ kỹ mật khẩu mới vì không có cách lấy lại.');
    };

    return (
        <div className="space-y-5">
            <section className="space-y-2">
                <h3 className="text-sm font-semibold text-slate-700">Các tab hiện trên thanh chọn</h3>
                <ul className="divide-y divide-slate-100 rounded-card border border-slate-200 bg-white">
                    {LOCKABLE_TABS.map(tab => {
                        const on = !hidden.includes(tab.id);
                        // Tab cuối cùng còn bật thì không tắt được
                        const last = on && hidden.length === LOCKABLE_TABS.length - 1;
                        return (
                            <li key={tab.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                                <span id={`${id}-${tab.id}`} className="text-[15px] text-slate-800">{tab.label}</span>
                                <span className="flex items-center gap-2 text-xs text-slate-500">
                                    {last && 'Còn mỗi tab này'}
                                    <Switch
                                        checked={on}
                                        disabled={last}
                                        onChange={(value) => setTabHidden(tab.id, !value)}
                                        aria-labelledby={`${id}-${tab.id}`}
                                    />
                                </span>
                            </li>
                        );
                    })}
                </ul>
                <p className="text-xs text-slate-500">
                    Bật tắt có tác dụng ngay. Tab đang mở bị tắt thì app chuyển sang tab còn bật. Phải còn ít nhất một tab.
                </p>
            </section>

            <form onSubmit={savePassword} className="space-y-2">
                <h3 className="text-sm font-semibold text-slate-700">Đổi mật khẩu</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="flex flex-col gap-1" htmlFor={`${id}-new`}>
                        <span className="text-xs font-semibold text-slate-600">Mật khẩu mới</span>
                        <Input id={`${id}-new`} type="password" autoComplete="new-password" value={next} onChange={(e) => { setNext(e.target.value); setError(''); }} />
                    </label>
                    <label className="flex flex-col gap-1" htmlFor={`${id}-confirm`}>
                        <span className="text-xs font-semibold text-slate-600">Nhập lại mật khẩu mới</span>
                        <Input id={`${id}-confirm`} type="password" autoComplete="new-password" value={confirm} onChange={(e) => { setConfirm(e.target.value); setError(''); }} />
                    </label>
                </div>
                {error && <p role="alert" className="text-sm font-semibold text-rose-600">{error}</p>}
                <p className="text-xs text-slate-500">{FORGOT_NOTE}</p>
                <div className="flex justify-end">
                    <Button type="submit" variant="secondary" disabled={!next || !confirm}>Đổi mật khẩu</Button>
                </div>
            </form>
        </div>
    );
};

/** Bảng bật tắt tab: mở bằng cách bấm 7 lần vào logo. Mỗi lần mở đều phải nhập mật khẩu. */
export const TabAccessDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const [unlocked, setUnlocked] = useState(false);
    return (
        // Nằm trên thanh trên cùng: cửa sổ thấp thì bảng cao gần hết cửa sổ, thanh trên đè lên nút Đóng
        <Modal isOpen={true} onClose={onClose} title={unlocked ? 'Bật tắt các tab' : 'Nhập mật khẩu'} maxWidth={unlocked ? 'md' : 'sm'} zIndex="z-[200]">
            {unlocked ? <ControlStep /> : <PasswordStep onUnlocked={() => setUnlocked(true)} />}
        </Modal>
    );
};
