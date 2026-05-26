require('dotenv').config();

const rawTargetTags = process.env.TARGET_TAGS || "";
const rawGeminiKeys = process.env.GEMINI_API_KEYS || "";

module.exports = {
    forumUrl: process.env.FORUM_BASE_URL,
    apiUrl: process.env.API_BASE_URL,
    
    forumToken: process.env.FORUM_API_TOKEN,
    botUid: parseInt(process.env.BOT_UID, 10),
    mentorpickApiKey: process.env.MENTORPICK_API_KEY,
    
    geminiApiKeys: rawGeminiKeys.split(',').map(k => k.trim()).filter(k => k.length > 0),
    targetTags: rawTargetTags.split(',').map(t => t.trim().toLowerCase()).filter(t => t.length > 0),
    ignoreTag:(process.env.IGNORE_TAG || "ai-response-false").toLowerCase(),
    
    startTimeMs: new Date(process.env.START_TIME).getTime(),
};