import React, { useState } from 'react';
import BrainService from '../services/brainService';

const SettingsModal = ({ onClose }) => {
  const [geminiKey, setGeminiKey] = useState(localStorage.getItem('pa_gemini_key') || '');
  const [fbConfig, setFbConfig] = useState(localStorage.getItem('pa_firebase_config') || '');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const save = () => {
    if (geminiKey.trim()) {
      localStorage.setItem('pa_gemini_key', geminiKey.trim());
    }

    if (fbConfig.trim()) {
      try {
        const config = JSON.parse(fbConfig.trim());
        localStorage.setItem('pa_firebase_config', JSON.stringify(config));
      } catch (e) {
        alert("Invalid Firebase config JSON! Please check the format.");
        return;
      }
    }

    // Reload to apply changes
    window.location.reload();
  };

  const testConnection = async () => {
    setIsTesting(true);
    setTestResult(null);

    try {
      // Test Gemini
      if (geminiKey.trim()) {
        const testBrain = new BrainService();
        testBrain.getApiKey = () => geminiKey.trim();

        const testResponse = await testBrain.chat("Hello! This is a connection test.");
        if (!testResponse.includes("I'm offline")) {
          setTestResult(prev => ({ ...prev, gemini: "✅ Gemini API working!" }));
        } else {
          setTestResult(prev => ({ ...prev, gemini: "❌ Gemini API test failed" }));
        }
      }

      // Test Firebase
      if (fbConfig.trim()) {
        try {
          const config = JSON.parse(fbConfig.trim());
          if (!firebase.apps.length) {
            firebase.initializeApp(config);
          }

          const testDb = firebase.firestore();
          await testDb.collection('test').doc('connection').set({ 
            test: true, 
            timestamp: new Date().toISOString() 
          });

          setTestResult(prev => ({ ...prev, firebase: "✅ Firebase connection working!" }));

        } catch (e) {
          setTestResult(prev => ({ ...prev, firebase: `❌ Firebase test failed: ${e.message}` }));
        }
      }

    } catch (e) {
      setTestResult({ error: `Test failed: ${e.message}` });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-gray-200 overflow-hidden">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-gray-800">⚙️ Settings</h2>
            <button 
              onClick={onClose} 
              className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
            >
              ✕
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">🧠 Gemini API Key</label>
              <textarea
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
                placeholder="Enter your Gemini API key here..."
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                rows="3"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">📡 Firebase Config</label>
              <textarea
                value={fbConfig}
                onChange={(e) => setFbConfig(e.target.value)}
                placeholder="Paste your Firebase web config JSON here..."
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none font-mono text-xs"
                rows="6"
              />
            </div>

            <div className="security-warning text-xs">
              <strong>🔒 Security Notice:</strong> Your API keys are stored locally in your browser and never sent to any server except the official Google APIs. Never share screenshots of this page.
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={testConnection}
                disabled={isTesting}
                className="flex-1 bg-indigo-100 text-indigo-700 py-2 px-4 rounded-lg hover:bg-indigo-200 disabled:opacity-50 transition-colors"
              >
                {isTesting ? 'Testing...' : '🔍 Test Connections'}
              </button>
              <button
                onClick={save}
                className="flex-1 bg-indigo-600 text-white py-2 px-4 rounded-lg hover:bg-indigo-700 transition-colors"
              >
                💾 Save
              </button>
            </div>

            {testResult && (
              <div className="space-y-2 text-sm">
                {testResult.gemini && <div>{testResult.gemini}</div>}
                {testResult.firebase && <div>{testResult.firebase}</div>}
                {testResult.error && <div className="text-red-600">{testResult.error}</div>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;