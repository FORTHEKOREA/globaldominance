import './styles.css';
import { auth, db } from './firebase.js';
import { signInAnonymously, onAuthStateChanged, updateProfile } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import i18next from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

const elements = {
  title: document.getElementById('title'),
  nicknameLabel: document.getElementById('nicknameLabel'),
  nicknameInput: document.getElementById('nicknameInput'),
  saveBtn: document.getElementById('saveBtn'),
  playBtn: document.getElementById('playBtn'),
  statusText: document.getElementById('statusText'),
  langSelect: document.getElementById('langSelect'),
  themeToggle: document.getElementById('themeToggle'),
  themeLabel: document.getElementById('themeLabel'),
};

await i18next.use(LanguageDetector).init({
  resources: {
    en: {
      translation: {
        title: 'Lobby',
        nickname: 'Nickname',
        save: 'Save',
        anon: 'Signed in anonymously',
        saved: 'Nickname saved',
        themeDark: 'Dark',
        themeLight: 'Light',
      },
    },
    ko: {
      translation: {
        title: '로비',
        nickname: '닉네임',
        save: '저장',
        anon: '익명 로그인됨',
        saved: '닉네임 저장 완료',
        themeDark: '다크',
        themeLight: '라이트',
      },
    },
  },
  fallbackLng: 'en',
  debug: false,
});

function applyLanguage(lng) {
  elements.title.textContent = i18next.t('title', { lng });
  elements.nicknameLabel.textContent = i18next.t('nickname', { lng });
  elements.saveBtn.textContent = i18next.t('save', { lng });
  localStorage.setItem('gd_lang', lng);
}

function applyTheme(dark) {
  if (dark) document.documentElement.classList.add('light');
  else document.documentElement.classList.remove('light');

  localStorage.setItem('gd_theme', dark ? 'light' : 'dark');
  elements.themeLabel.textContent = i18next.t(dark ? 'themeLight' : 'themeDark');
  elements.themeToggle.checked = dark;
}

async function ensureAnon() {
  if (!auth.currentUser) {
    try {
      await signInAnonymously(auth);
    } catch (e) {
      console.error(e);
      elements.statusText.textContent = 'Auth error';
    }
  }
}

async function saveNickname(nick) {
  await ensureAnon();
  const user = auth.currentUser;
  if (!user) throw new Error('No authenticated user');

  await updateProfile(user, { displayName: nick });
  await setDoc(
    doc(db, 'players', user.uid),
    {
      nickname: nick,
      uid: user.uid,
      lastSeen: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );
}

const initialLang = localStorage.getItem('gd_lang') || (navigator.language.startsWith('ko') ? 'ko' : 'en');
elements.langSelect.value = initialLang;
applyLanguage(initialLang);

const savedTheme = localStorage.getItem('gd_theme');
applyTheme(savedTheme === 'light');

onAuthStateChanged(auth, (user) => {
  if (user) {
    elements.statusText.textContent = i18next.t('anon');
  }
});

elements.langSelect.addEventListener('change', (e) => applyLanguage(e.target.value));
elements.themeToggle.addEventListener('change', (e) => applyTheme(e.target.checked));

elements.saveBtn.addEventListener('click', async () => {
  const nick = elements.nicknameInput.value.trim();
  if (!nick) {
    elements.statusText.textContent = 'Enter a nickname';
    return;
  }

  try {
    await saveNickname(nick);
    localStorage.setItem('gd_nickname', nick);
    elements.statusText.textContent = i18next.t('saved');
  } catch (err) {
    console.error(err);
    elements.statusText.textContent = 'Save failed';
  }
});

elements.playBtn.addEventListener('click', async () => {
  const nick = elements.nicknameInput.value.trim();
  if (nick) {
    try {
      await saveNickname(nick);
      localStorage.setItem('gd_nickname', nick);
    } catch (err) {
      console.warn('[Play] nickname save skipped:', err.message);
    }
  }
  window.location.href = '/game.html';
});

(function init() {
  const cached = localStorage.getItem('gd_nickname');
  if (cached) elements.nicknameInput.value = cached;
  ensureAnon();
})();
