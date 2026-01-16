import React, { useState, useEffect, useRef } from 'react';
import BrainService from './services/brainService';
import DataService from './services/dataService';
import HappyBot from './components/HappyBot';
import SettingsModal from './components/SettingsModal';
import { marked } from 'marked';

const brain = new BrainService();
const data = new DataService();

const App = () => {
  const [activeTab, setActiveTab] = useState('tasks');
  const [tasks, setTasks] = useState([]);
  const [shopping, setShopping] = useState([]);
  const [events, setEvents] = useState([]);
  const [family, setFamily] = useState([]);
  const [aiResponse, setAiResponse] = useState('');
  const [aiState, setAiState] = useState('idle');
  const [showSettings, setShowSettings] = useState(false);
  const [newTask, setNewTask] = useState('');
  const [newItem, setNewItem] = useState('');
  const [newEvent, setNewEvent] = useState('');
  const [kitchenMode, setKitchenMode] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    // Load initial data
    const snapshot = data.getSnapshot();
    setTasks(snapshot.tasks);
    setShopping(snapshot.shopping);
    setEvents(snapshot.events);
    setFamily(snapshot.family);

    // Set up listeners for real-time updates
    data.subscribe('tasks', setTasks);
    data.subscribe('shopping', setShopping);
  }, []);

  const handleAddTask = async () => {
    if (!newTask.trim()) return;
    const task = await data.add('tasks', { text: newTask, completed: false });
    setTasks([task, ...tasks]);
    setNewTask('');
  };

  const handleAddItem = async () => {
    if (!newItem.trim()) return;
    const item = await data.add('shopping', { text: newItem, completed: false });
    setShopping([item, ...shopping]);
    setNewItem('');
  };

  const handleAddEvent = async () => {
    if (!newEvent.trim()) return;
    const event = await data.add('events', { text: newEvent });
    setEvents([...events, event]);
    setNewEvent('');
  };

  const handleToggle = async (collection, id, status) => {
    await data.toggle(collection, id, status);
    if (collection === 'tasks') {
      setTasks(tasks.map(t => t.id === id ? { ...t, completed: !status } : t));
    } else if (collection === 'shopping') {
      setShopping(shopping.map(s => s.id === id ? { ...s, completed: !status } : s));
    }
  };

  const handleRemove = async (collection, id) => {
    await data.remove(collection, id);
    if (collection === 'tasks') {
      setTasks(tasks.filter(t => t.id !== id));
    } else if (collection === 'shopping') {
      setShopping(shopping.filter(s => s.id !== id));
    } else if (collection === 'events') {
      setEvents(events.filter(e => e.id !== id));
    }
  };

  const handleBotClick = async () => {
    if (aiState === 'listening') return;

    setAiState('listening');
    setAiResponse('');

    try {
      // Simulate voice recognition
      setTimeout(async () => {
        setAiState('thinking');
        const prompt = "What would you like to ask? (Simulated voice input)";
        const response = await brain.chat(prompt);
        setAiResponse(response);
        setAiState('idle');
      }, 1000);
    } catch (e) {
      setAiState('idle');
      setAiResponse('Sorry, I had trouble processing that.');
    }
  };

  const handleImageUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target.result);
        setSelectedImage(file);
      };
      reader.readAsDataURL(file);
    }
  };

  const processImageWithAI = async () => {
    if (!selectedImage) return;

    setAiState('thinking');
    setAiResponse('');

    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target.result.split(',')[1];
      const fileData = { type: selectedImage.type, base64 };

      const response = await brain.think(
        "Analyze this image and describe what you see. Provide helpful information based on the content.",
        fileData
      );

      setAiResponse(response.reply || JSON.stringify(response));
      setAiState('idle');
      setImagePreview(null);
      setSelectedImage(null);
    };
    reader.readAsDataURL(selectedImage);
  };

  const FamilyCard = ({ member }) => (
    <div className={`dashboard-card p-4 ${member.style} text-white shadow-lg`}>
      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-xl font-bold">{member.name}</h3>
          <p className="opacity-90">{member.status}</p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold">{member.stars || 0}</div>
          <div className="text-xs opacity-75">⭐ stars</div>
        </div>
      </div>
      <div className="mt-3 text-center text-xs opacity-75">ID: {member.letter}</div>
    </div>
  );

  const ItemList = ({ items, onToggle, onRemove, placeholder, onAdd, inputValue, setInputValue }) => (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder={placeholder}
          className="flex-1 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          onKeyPress={(e) => e.key === 'Enter' && onAdd()}
        />
        <button
          onClick={onAdd}
          className="bg-indigo-600 text-white px-4 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          ➕
        </button>
      </div>
      <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
        {items.map(item => (
          <div key={item.id} className="flex items-center justify-between bg-white/80 backdrop-blur-sm p-3 rounded-lg border border-gray-200">
            <div className="flex items-center space-x-3">
              <input
                type="checkbox"
                checked={item.completed}
                onChange={() => onToggle(item.id, item.completed)}
                className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500"
              />
              <span className={`${item.completed ? 'line-through text-gray-500' : ''}`}>{item.text}</span>
            </div>
            <button
              onClick={() => onRemove(item.id)}
              className="text-red-500 hover:text-red-700 transition-colors"
            >
              🗑️
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className={`min-h-screen ${kitchenMode ? 'kitchen-mode pb-safe-nav' : 'pb-safe-nav'}`}>
      <div className="container mx-auto px-4 py-8 max-w-md">
        {/* Header */}
        <header className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">Nasima's PA</h1>
          <p className="text-gray-600">Your family assistant</p>
        </header>

        {/* AI Section */}
        <div className="dashboard-card p-6 mb-6 text-center">
          <HappyBot state={aiState} onClick={handleBotClick} />
          {aiResponse && (
            <div className="mt-4 ai-response bg-indigo-50 p-4 rounded-lg text-left">
              <div dangerouslySetInnerHTML={{ __html: marked(aiResponse) }} />
            </div>
          )}
          
          {imagePreview && (
            <div className="mt-4">
              <img src={imagePreview} alt="Preview" className="max-w-full h-48 object-cover rounded-lg" />
              <button
                onClick={processImageWithAI}
                className="mt-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Analyze Image
              </button>
            </div>
          )}

          <input
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            ref={fileInputRef}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="mt-4 bg-indigo-100 text-indigo-700 px-4 py-2 rounded-lg hover:bg-indigo-200 transition-colors"
          >
            📷 Upload Image
          </button>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <button
            onClick={() => setKitchenMode(!kitchenMode)}
            className={`p-3 rounded-xl ${kitchenMode ? 'bg-yellow-500 text-white' : 'bg-gray-100'} transition-colors`}
          >
            {kitchenMode ? '☀️ Day' : '🌙 Night'}
          </button>
          <button
            onClick={() => setActiveTab('family')}
            className="p-3 bg-purple-100 text-purple-700 rounded-xl hover:bg-purple-200 transition-colors"
          >
            👨‍👩‍👧‍👦 Family
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="p-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors"
          >
            ⚙️ Settings
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex justify-between mb-6 bg-gray-100 p-1 rounded-xl">
          {['tasks', 'shopping', 'events'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 px-3 rounded-lg text-center capitalize transition-colors ${
                activeTab === tab ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-600'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <main className="dashboard-card p-6">
          {activeTab === 'tasks' && (
            <ItemList
              items={tasks}
              onToggle={(id, status) => handleToggle('tasks', id, status)}
              onRemove={(id) => handleRemove('tasks', id)}
              placeholder="Add a task..."
              onAdd={handleAddTask}
              inputValue={newTask}
              setInputValue={setNewTask}
            />
          )}

          {activeTab === 'shopping' && (
            <ItemList
              items={shopping}
              onToggle={(id, status) => handleToggle('shopping', id, status)}
              onRemove={(id) => handleRemove('shopping', id)}
              placeholder="Add an item..."
              onAdd={handleAddItem}
              inputValue={newItem}
              setInputValue={setNewItem}
            />
          )}

          {activeTab === 'events' && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newEvent}
                  onChange={(e) => setNewEvent(e.target.value)}
                  placeholder="Add an event..."
                  className="flex-1 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  onKeyPress={(e) => e.key === 'Enter' && handleAddEvent()}
                />
                <button
                  onClick={handleAddEvent}
                  className="bg-indigo-600 text-white px-4 rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  ➕
                </button>
              </div>
              <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
                {events.map(event => (
                  <div key={event.id} className="flex items-center justify-between bg-white/80 backdrop-blur-sm p-3 rounded-lg border border-gray-200">
                    <span>{event.text}</span>
                    <button
                      onClick={() => handleRemove('events', event.id)}
                      className="text-red-500 hover:text-red-700 transition-colors"
                    >
                      🗑️
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'family' && (
            <div className="space-y-4">
              {family.map(member => (
                <FamilyCard key={member.id} member={member} />
              ))}
            </div>
          )}
        </main>

        {/* Footer */}
        <footer className="mt-8 text-center text-gray-500 text-sm">
          <p>Powered by Gemini AI & Firebase</p>
        </footer>
      </div>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
};

export default App;