import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ReminderPopup from './features/nhac-viec/ReminderPopup';
import './styles.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Không tìm thấy phần tử gốc');

// Cửa sổ nhắc việc bật lên dùng chung bản dựng với cửa sổ chính, phân biệt bằng địa chỉ
const isReminderPopup = new URLSearchParams(window.location.search).get('popup') === 'nhac-viec';

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    {isReminderPopup ? <ReminderPopup /> : <App />}
  </React.StrictMode>,
);
