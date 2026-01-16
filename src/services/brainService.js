// --- BRAIN SERVICE (GEMINI 2.5 FLASH) ---
class BrainService {
  constructor() {
    this.baseUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-exp-1206:generateContent";
  }

  getApiKey() { 
    return localStorage.getItem('pa_gemini_key') || ""; 
  }

  async think(prompt, fileData = null) {
    const apiKey = this.getApiKey();
    if (!apiKey) return { error: "MISSING_KEY", reply: "Please add your Gemini API key in Settings to enable smart features!" };
    
    const parts = [{ text: prompt }];
    if (fileData) parts.push({ inlineData: { mimeType: fileData.type, data: fileData.base64 } });
    
    try {
      const response = await fetch(`${this.baseUrl}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: parts }],
          generationConfig: { responseMimeType: "application/json" }
        })
      });
      
      const data = await response.json();
      return JSON.parse(data.candidates[0].content.parts[0].text);
      
    } catch (e) {
      console.error("Brain error:", e);
      return { 
        error: "BRAIN_ERROR", 
        reply: "My thinking engine is having trouble. Try again in a moment!" 
      };
    }
  }

  async chat(prompt) {
    const apiKey = this.getApiKey();
    if (!apiKey) return "Please paste your API key in Settings.";
    
    try {
      const response = await fetch(`${this.baseUrl}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
      
      const data = await response.json();
      return data.candidates[0].content.parts[0].text;
      
    } catch (e) { 
      return "I'm offline right now. Try again later!";
    }
  }
}

export default BrainService;