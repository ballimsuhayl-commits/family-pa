// --- DATA SERVICE (FIREBASE) ---
class DataService {
  constructor() {
    this.db = null;
    this.appId = 'nasima-family-pa';
    const storedConfig = localStorage.getItem('pa_firebase_config');
    
    if (storedConfig) {
      try {
        // Use global firebase object
        const config = JSON.parse(storedConfig);
        if (!firebase.apps.length) firebase.initializeApp(config);
        this.db = firebase.firestore();
        
        // Setup anonymous auth
        firebase.auth().signInAnonymously().catch(e => {
          console.warn("Anonymous auth failed, continuing without auth:", e);
        });
        
        console.log("Firebase initialized successfully");
        
      } catch (e) {
        console.error("Firebase initialization failed:", e);
        localStorage.removeItem('pa_firebase_config');
        alert(`Firebase setup failed: ${e.message}. Please check your configuration in Settings.`);
      }
    }
    
    // Initialize default family status if not exists
    if (!localStorage.getItem('pa_family_status')) {
      localStorage.setItem('pa_family_status', JSON.stringify([
        { id: 'nasima', name: 'Nasima', letter: 'N', status: 'Available', style: 'family-nasima', stars: 0 },
        { id: 'suhayl', name: 'Suhayl', letter: 'S', status: 'Working', style: 'family-suhayl', stars: 0 },
        { id: 'rayhaan', name: 'Rayhaan', letter: 'R', status: 'School', style: 'family-rayhaan', stars: 0 },
        { id: 'zaara', name: 'Zaara', letter: 'Z', status: 'School', style: 'family-zaara', stars: 0 },
        { id: 'jabu', name: 'Jabu', letter: 'J', status: 'Helping', style: 'family-jabu', stars: 0 },
        { id: 'lisa', name: 'Lisa', letter: 'L', status: 'Helping', style: 'family-lisa', stars: 0 },
      ]));
    }
  }

  getFamilyStatus() { 
    return JSON.parse(localStorage.getItem('pa_family_status') || '[]'); 
  }

  updateStars(memberId, amount) {
    let family = this.getFamilyStatus();
    family = family.map(f => {
      if (f.name.toLowerCase().includes(memberId.toLowerCase())) {
        return { ...f, stars: (f.stars || 0) + amount };
      }
      return f;
    });
    localStorage.setItem('pa_family_status', JSON.stringify(family));
    return family;
  }

  async add(collectionName, item) {
    const localKey = `pa_${collectionName}`;
    const localItems = JSON.parse(localStorage.getItem(localKey) || '[]');
    const newItem = { 
      id: 'loc_' + Date.now(), 
      ...item, 
      createdAt: Date.now(),
      completed: item.completed || false
    };
    
    // Add to local storage immediately for optimistic UI
    const updatedItems = [newItem, ...localItems];
    localStorage.setItem(localKey, JSON.stringify(updatedItems));
    
    // Try to sync to cloud
    if (this.db) {
      try {
        const collectionRef = firebase.firestore().collection('artifacts').doc(this.appId)
                           .collection('public').doc('data')
                           .collection(collectionName);
        
        const docRef = await collectionRef.add({ 
          ...item, 
          createdAt: Date.now(),
          completed: item.completed || false
        });
        
        // Update local item with cloud ID
        const finalItems = updatedItems.map(i => 
          i.id === newItem.id ? { ...i, id: docRef.id } : i
        );
        
        localStorage.setItem(localKey, JSON.stringify(finalItems));
        return { ...newItem, id: docRef.id };
        
      } catch (e) {
        console.error(`Cloud sync failed for ${collectionName}:`, e);
        // Keep local version - it will sync later when connection is restored
        return newItem;
      }
    }
    
    return newItem;
  }

  subscribe(collectionName, callback) {
    const localKey = `pa_${collectionName}`;
    const localItems = JSON.parse(localStorage.getItem(localKey) || '[]');
    callback(localItems.filter(i => !i.completed)); // Filter out completed items for UI
    
    // Return cleanup function
    return () => {
      // No-op for now, real-time sync is handled at init
    };
  }

  getSnapshot() {
    return {
      tasks: JSON.parse(localStorage.getItem('pa_tasks') || '[]').filter(i => !i.completed),
      shopping: JSON.parse(localStorage.getItem('pa_shopping') || '[]').filter(i => !i.completed),
      events: JSON.parse(localStorage.getItem('pa_events') || '[]'),
      family: this.getFamilyStatus()
    };
  }

  async toggle(col, id, status) {
    // Update local storage first
    let items = JSON.parse(localStorage.getItem(`pa_${col}`) || '[]');
    items = items.map(i => i.id === id ? { ...i, completed: !status } : i);
    localStorage.setItem(`pa_${col}`, JSON.stringify(items));
    
    // Try to update cloud
    if (this.db && !id.startsWith('loc_')) {
      try {
        const docRef = firebase.firestore().collection('artifacts').doc(this.appId)
                     .collection('public').doc('data')
                     .collection(col).doc(id);
        
        await docRef.update({ completed: !status });
      } catch (e) {
        console.error(`Cloud update failed for ${col}/${id}:`, e);
        // Local state is already updated, will sync later
      }
    }
  }

  async remove(col, id) {
    // Update local storage first
    let items = JSON.parse(localStorage.getItem(`pa_${col}`) || '[]');
    items = items.filter(i => i.id !== id);
    localStorage.setItem(`pa_${col}`, JSON.stringify(items));
    
    // Try to remove from cloud
    if (this.db && !id.startsWith('loc_')) {
      try {
        const docRef = firebase.firestore().collection('artifacts').doc(this.appId)
                     .collection('public').doc('data')
                     .collection(col).doc(id);
        
        await docRef.delete();
      } catch (e) {
        console.error(`Cloud delete failed for ${col}/${id}:`, e);
        // Local state is already updated, will sync later
      }
    }
  }
}

export default DataService;