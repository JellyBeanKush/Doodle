import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from 'node-fetch';
import { FormData, Blob } from 'formdata-node';

const CONFIG = {
    GEMINI_KEY: process.env.GEMINI_API_KEY,
    DISCORD_URL: process.env.DISCORD_WEBHOOK, 
    IMAGE_MODEL: "gemini-3.1-flash-image-preview", 
    // Added fallback model for when Lite is busy
    TEXT_MODELS: ["gemini-3.1-flash-lite-preview", "gemini-3-flash-preview", "gemini-1.5-flash"]
};

const BASE_VIBES = ["Vibrant 2D Vector", "3D Claymation", "Whimsical Watercolor", "Pop Art Comic", "Retro 1930s Cartoon", "Studio Ghibli Anime", "16-Bit Pixel Art", "Surrealism", "Cyberpunk Neon", "Charcoal Sketch", "Modern Papercut", "Ukiyo-e Print", "90s Nicktoon", "Oil Painting", "Low-Poly PS1 Aesthetic"];

const today = new Date();
const dateISO = today.toISOString().split('T')[0];
const dateHeader = today.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles' });

async function getHolidayContext() {
    const monthDay = `${today.getMonth() + 1}-${today.getDate()}`;
    const PRIORITY_LIST = {
        "3-6": { theme: "National Oreo Cookie Day", greeting: "Happy Oreo Day!" },
        "3-10": { theme: "Mario Day", greeting: "Happy MAR10 Day!" },
        "4-22": { theme: "Jelly Bean Day", greeting: "Happy Jelly Bean Day!" }
    };
    if (PRIORITY_LIST[monthDay]) return PRIORITY_LIST[monthDay];
    try {
        const res = await fetch(`https://www.checkiday.com/api/v3/events?date=${dateISO}`);
        const data = await res.json();
        if (data.events?.length > 0) return { theme: data.events[0].name, greeting: `Happy ${data.events[0].name}!` };
    } catch (e) {}
    const backups = ["Sunday Funday", "Motivation Monday", "Taco Tuesday", "Wild Wednesday", "Retro Thursday", "Pizza Friday", "Gaming Saturday"];
    return { theme: backups[today.getDay()], greeting: `Happy ${backups[today.getDay()]}!` };
}

// Helper to try multiple models if one is busy
async function generateWithRetry(genAI, prompt, isImage = false) {
    const models = isImage ? [CONFIG.IMAGE_MODEL] : CONFIG.TEXT_MODELS;
    
    for (const modelName of models) {
        try {
            console.log(`Attempting with ${modelName}...`);
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent(prompt);
            return result;
        } catch (err) {
            if (err.message.includes("503") || err.message.includes("high demand")) {
                console.warn(`⚠️ ${modelName} busy, trying next...`);
                continue;
            }
            throw err;
        }
    }
    throw new Error("All models are currently busy.");
}

async function main() {
    console.log("🚀 Starting Daily Doodle Bot...");
    const holiday = await getHolidayContext();
    const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_KEY);
    
    const dayCount = Math.floor(today.getTime() / 86400000);
    const style = BASE_VIBES[dayCount % BASE_VIBES.length];

    // Character descriptions as requested
    const charDesc = "a small round yellow bear with a cream belly and purple eyes next to a pink oblong jellybean with a teal cap";

    // Text Generations with Retry Logic
    const twistRes = await generateWithRetry(genAI, `Style: ${style}. Holiday: ${holiday.theme}. Describe a scene with ${charDesc} celebrating. 15 words max.`);
    const sceneDescription = twistRes.response.text().trim();

    const factRes = await generateWithRetry(genAI, `One interesting fact about ${holiday.theme} in 15 words.`);
    const fact = factRes.response.text().trim();

    const finalPrompt = `${style} style. ${sceneDescription}. MANDATORY: Include the text "${holiday.greeting.toUpperCase()}" perfectly, exactly once.`;

    try {
        // Image Generation with Retry
        const imageModel = genAI.getGenerativeModel({ 
            model: CONFIG.IMAGE_MODEL,
            systemInstruction: "You are a professional graphic designer. Text must be spelled perfectly and only appear once."
        });

        const result = await imageModel.generateContent({
            contents: [{ role: 'user', parts: [{ text: finalPrompt }] }],
            generationConfig: { responseMimeType: "image/png", seed: dayCount }
        });
        
        const part = result.response.candidates[0].content.parts[0];
        if (!part.inlineData) throw new Error("No image generated.");

        const imageBuffer = Buffer.from(part.inlineData.data, 'base64');
        const formData = new FormData();
        
        formData.set('payload_json', JSON.stringify({
            content: `**${dateHeader}**\n# ${holiday.theme.toUpperCase()}\n${fact}\n*Streaming at: twitch.tv/HoneyBearSquish*`
        }));
        formData.set('files[0]', new Blob([imageBuffer], { type: 'image/png' }), 'doodle.png');

        const discordRes = await fetch(CONFIG.DISCORD_URL, { method: 'POST', body: formData });
        if (discordRes.ok) console.log(`✅ Success! Posted ${holiday.theme}`);
    } catch (err) {
        console.error("💥 Fatal Error:", err.message);
    }
}

main();
