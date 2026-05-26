const axios = require('axios');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const logger = require('./logger');
const agent = require('./src/agent');

const DB_FILE = path.join(__dirname, 'data/ai-replies.json');

if (!fs.existsSync(path.join(__dirname, 'data'))) {
    fs.mkdirSync(path.join(__dirname, 'data'));
}
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify([]));
}

function getTrackedPids() { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
function saveTrackedPid(pid) {
    if (!pid) return;
    const data = getTrackedPids();
    if (!data.includes(pid)) {
        data.push(pid);
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
    }
}

const topicCache = {};

async function pollForum() {
    logger.info(`🔄 Scanning for new activity...`);
    try {
        let allRecentTopics = [];
        let page = 1;
        let keepScanning = true;

        while (keepScanning) {
            logger.info(`   📄 Fetching page ${page} of the forum...`);
            
            let catRes;
            try {
                catRes = await axios.get(`${config.forumUrl}/api/category/5?page=${page}&_=${Date.now()}`, {
                    headers: { 'Authorization': `Bearer ${config.forumToken}` }
                });
            } catch (pageErr) {
                if (pageErr.response && pageErr.response.status === 404) {
                    logger.info(`   🏁 Reached end of category pages.`);
                    break;
                }
                throw pageErr;
            }
            
            if (!catRes.data.topics || catRes.data.topics.length === 0) break;

            for (const topic of catRes.data.topics) {
                const lastActivity = topic.lastposttime || topic.timestamp;
                if (lastActivity < config.startTimeMs) {
                    keepScanning = false; 
                    continue;
                }
                allRecentTopics.push(topic);
            }
            page++;
        }

        logger.info(`   🎯 Found ${allRecentTopics.length} active topics since the cutoff time.`);

        for (const topic of allRecentTopics) {
            const topicTags = topic.tags ? topic.tags.map(t => t.value.toLowerCase()) : [];

            // FILTER 1: Already Solved
            if (topicTags.includes('solved') || topicTags.includes(config.ignoreTag)) continue;

            // FILTER 2: Target Tags
            if (config.targetTags.length > 0) {
                const hasTargetTag = topicTags.some(tag => config.targetTags.includes(tag));
                if (!hasTargetTag) continue;
            }

            // FILTER 3: Past Doubts
            const lastActivity = topic.lastposttime || topic.timestamp;
            if (topicCache[topic.tid] === lastActivity) continue;
            topicCache[topic.tid] = lastActivity;

            const topicRes = await axios.get(`${config.forumUrl}/api/topic/${topic.tid}?_=${Date.now()}`, {
                headers: { 'Authorization': `Bearer ${config.forumToken}` }
            });
            
            const posts = topicRes.data.posts;
            const lastPost = posts[posts.length - 1];
            
            // FILTER 4: Already replied
            if (lastPost.user && lastPost.user.username !== 'mp-nbb-bot') continue;

            const trackedPids = getTrackedPids();
            if (trackedPids.includes(lastPost.pid)) continue;

            logger.info(`\n🚨 REAL ACTION REQUIRED: Processing Topic ${topic.tid} - "${topic.title}"`);
            
            const processed = await agent.processDoubt(topic, posts);
            if (processed) {
                saveTrackedPid(lastPost.pid);
                await new Promise(res => setTimeout(res, 8000));
            }
        }
    } catch (error) {
        logger.error(`❌ Polling Error: ${error.message}`);
    }
}

async function runBot() {
    logger.info(`🚀 Starting Real-Time Conversational Agent in ${config.targetTags.length > 0 ? 'TARGETED' : 'GLOBAL'} Mode...`);
    logger.info(`🔗 Connected to: ${config.forumUrl}`);
    
    while (true) {
        await pollForum();
        logger.info(`⏳ Batch complete. Sleeping for 60 seconds...\n`);
        await new Promise(res => setTimeout(res, 60000));
    }
}

runBot();