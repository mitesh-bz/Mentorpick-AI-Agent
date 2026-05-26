const axios = require('axios');
const config = require('../../config');
const logger = require('../../logger');

class GeminiService {
    constructor() {
        this.keys = config.geminiApiKeys;
        this.currentIndex = 0;
    }

    getNextKey() {
        if (this.keys.length === 0) throw new Error("No Gemini keys configured.");
        const key = this.keys[this.currentIndex];
        this.currentIndex = (this.currentIndex + 1) % this.keys.length;
        return key;
    }

    async generateHint(promptText) {
        for (let attempt = 1; attempt <= this.keys.length; attempt++) {
            const key = this.getNextKey();
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${key}`;
            
            try {
                const response = await axios.post(url, {
                    contents: [{ parts: [{ text: promptText }] }]
                }, { headers: { 'Content-Type': 'application/json' } });
                
                let text = response.data.candidates[0].content.parts[0].text;
                return text.replace(/\$(.*?)\$/g, '`$1`'); 
            } catch (err) {
                const status = err.response ? err.response.status : null;
                if (status === 429 || status === 503) {
                    logger.warn(`Gemini API Limit hit. Retrying in 15s... (Attempt ${attempt}/3)`);
                    await new Promise(res => setTimeout(res, 15000));
                } else {
                    throw err;
                }
            }
        }
        throw new Error("Gemini API failed after every attempt.");
    }
}

module.exports = new GeminiService();