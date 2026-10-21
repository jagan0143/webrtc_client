import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/global.css';
import { unlockAudio } from './webrtc/tones';

// Browsers block sound until the user interacts with the page; unlock it on
// the first tap/keypress so the ringtone can play for incoming calls.
for (const event of ['pointerdown', 'keydown', 'touchstart']) {
  window.addEventListener(event, unlockAudio, { passive: true });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
