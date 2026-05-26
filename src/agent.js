const axios = require('axios');
const cheerio = require('cheerio');
const config = require('../config');
const logger = require('../logger');
const geminiService = require('./services/gemini.service');
const defaultPrompt = require('./prompts/defaultPrompt');

async function processDoubt(topic, posts) {
    const match = posts[0].content.match(/viewSubmission\/([a-f0-9]+)/);
    if (!match) {
        logger.info(`   ⏩ No Mentorpick submission link found. Skipping...`);
        return false;
    }
    const submissionId = match[1];

    try {
        // 1. Fetch Submission Data
        const subRes = await axios.get(`${config.apiUrl}/api/beinginfinity/submission/${submissionId}`, {
            headers: { 'bi-api-key': config.mentorpickApiKey }
        });
        
        // SAFETY CHECK
        if (!subRes.data || !subRes.data.data || !subRes.data.data.submissionDetails) {
            logger.error(`   ❌ API response invalid for submission ${submissionId}.`);
            logger.error(`   Raw Response: ${JSON.stringify(subRes.data).substring(0, 200)}...`);
            return true; 
        }

        const responseData = subRes.data.data;
        const subDetails = responseData.submissionDetails;
        const subCode = responseData.submissionCode;
        const studentName = subDetails?.user?.firstName || subDetails?.user?.userName || "there";
        const problemSlug = subDetails?.problem?.slug;
        const userCode = subCode?.userCode || subCode?.code || "No code found.";
        const errorHint = subCode?.verdict_string || subCode?.test_results?.[0]?.verdict || "Unknown Error";

        // 2. Fetch Problem HTML 
        let cleanProblemText = "No description available.";
        if (problemSlug) {
            try {
                const probRes = await axios.get(`${config.apiUrl}/problem/html/${problemSlug}`, {
                    headers: { 'bi-api-key': config.mentorpickApiKey }
                });
                const $ = cheerio.load(probRes.data);
                cleanProblemText = $.text().replace(/\s+/g, ' ').trim();
            } catch (e) {
                logger.warn(`   ⚠️ Failed to fetch problem text for slug: ${problemSlug}`);
            }
        }

        // 3. Build Chat History
        let chatHistory = "";
        posts.forEach((p, index) => {
            let cleanText = p.content.replace(/<[^>]*>?/gm, '').trim();
            let speaker = (p.user && p.user.username === 'mp-nbb-bot') ? "Student" : "Mentor";
            chatHistory += `${speaker} (Message ${index + 1}):\n${cleanText}\n\n`;
        });

        // 4. Generate AI Prompt 
        logger.info(`   🧠 Waking up Gemini to analyze code for ${studentName}...`);
        const prompt = defaultPrompt({
            studentName,
            cleanProblemText,
            errorHint,
            userCode,
            chatHistory
        });

        const aiResponseText = await geminiService.generateHint(prompt);

        // 5. STALE DATA CHECK
        const reCheckRes = await axios.get(`${config.forumUrl}/api/topic/${topic.tid}`, {
            headers: { 'Authorization': `Bearer ${config.forumToken}` }
        });
        const currentTags = reCheckRes.data.tags ? reCheckRes.data.tags.map(t => t.value.toLowerCase()) : [];
        if (currentTags.includes(config.ignoreTag)) {
            logger.warn(`   🛑 User opted out during processing. Aborting post.`);
            return true; 
        }

        // 6. Post Reply
        logger.info(`   📝 Posting live reply to forum...`);
        await axios.post(`${config.forumUrl}/api/v3/topics/${topic.tid}`, 
            { 
                _uid: config.botUid, 
                content: aiResponseText 
            },
            {
                headers: {
                    'Authorization': `Bearer ${config.forumToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        logger.info(`   ✅ Success! Reply posted to Topic ${topic.tid}`);
        return true;

    } catch (error) {
        logger.error(`   ❌ Error processing Topic ${topic.tid}: ${error.message}`);
        return true; 
    }
}

module.exports = { processDoubt };