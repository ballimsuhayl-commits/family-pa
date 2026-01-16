import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Import global styles
import './styles/global.css';

// Initialize Firebase scripts (these would normally be in index.html)
const firebaseScripts = [
  'https://www.gstatic.com/firebasejs/11.6.1/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore-compat.js'
];

// Load Firebase scripts dynamically
const loadFirebase = async () => {
  for (const scriptUrl of firebaseScripts) {
    const script = document.createElement('script');
    script.src = scriptUrl;
    document.head.appendChild(script);
    await new Promise((resolve) => {
      script.onload = resolve;
    });
  }
};

// Load external dependencies
const loadExternalLibraries = async () => {
  // Load Tailwind via CDN
  const tailwindLink = document.createElement('link');
  tailwindLink.rel = 'stylesheet';
  tailwindLink.href = 'https://cdn.tailwindcss.com';
  document.head.appendChild(tailwindLink);

  // Load Font Awesome
  const fontAwesomeLink = document.createElement('link');
  fontAwesomeLink.rel = 'stylesheet';
  fontAwesomeLink.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css';
  document.head.appendChild(fontAwesomeLink);
};

// Initialize the app after loading dependencies
const initializeApp = async () => {
  await loadExternalLibraries();
  await loadFirebase();
  
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
};

initializeApp();