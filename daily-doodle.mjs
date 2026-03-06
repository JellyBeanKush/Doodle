import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from 'node-fetch';
import { FormData, Blob } from 'formdata-node';

const CONFIG = {
    GEMINI_KEY: process.env.GEMINI_API_KEY,
    DISCORD_URL: process.env.DISCORD_WEBHOOK, 
    IMAGE_MODEL: "gemini-3.1-flash-image-preview", // Nano Banana 2 (2026)
    TEXT_MODEL: "gemini-3.1-flash-lite-preview"
};

// 15-day style rotation
const BASE_VIBES = [
    "Vibrant 2D Vector", "3D Claymation", "Whimsical Watercolor", "Pop Art Comic", 
    "Retro 1930s Cartoon", "Studio Ghibli Anime", "16-Bit Pixel Art", "Surrealism", 
    "Cyberpunk Neon", "Charcoal Sketch", "Modern Papercut", "Ukiyo-e Print", 
    "90s Nicktoon", "Oil Painting", "Low-Poly PS1 Aesthetic"
];

const today = new Date();
const dateISO = today.toISOString().split('T')[0];
const dateHeader = today.toLocaleDateString('en-US', { 
    month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles' 
});

async function getHolidayContext() {
    const monthDay = `${today.getMonth() + 1}-${today.getDate()}`;
    
    // Manual override for your favorites
    const PRIORITY_LIST = {
        "3-6": { theme: "National Oreo Cookie Day", greeting: "Happy Oreo Day!" },
        "3-10": { theme: "Mario Day", greeting: "Happy MAR10 Day!" },
        "4-22": { theme: "Jelly Bean Day", greeting: "Happy Jelly Bean Day!" },
        "12-25": { theme: "Christmas", greeting: "Merry Christmas!" }
    };

    if (PRIORITY_LIST[monthDay]) return PRIORITY_LIST[monthDay];

    // Check Unofficial Holiday API
    try {
        const res = await fetch(`https://www.checkiday.com/api/v3/events?date=${dateISO}`);
        const data = await res.json();
        if (data.events?.length > 0) {
            const holiday = data.events[0].name;
            return { theme: holiday, greeting: `Happy ${holiday}!` };
        }
    } catch (e) { console.warn("API Offline, using backup..."); }

    // Backup: Day of week vibe
    const backups = ["Sunday Funday", "Motivation Monday", "Taco Tuesday", "Wild Wednesday", "Retro Thursday", "Pizza Friday", "Gaming Saturday"];
    return { theme: backups[today.getDay()], greeting: `Happy ${backups[today.getDay()]}!` };
}

async function main() {
    console.log("🚀 Starting Daily Doodle Bot...");
    const holiday = await getHolidayContext();
    const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_KEY);
    const textModel = genAI.getGenerativeModel({ model: CONFIG.TEXT_MODEL });
    
    // Cycle styles every 24 hours
    const dayCount = Math.floor(today.getTime() / 86400000);
    const style = BASE_VIBES[dayCount % BASE_VIBES.length];

    // Generate descriptive prompt via text model
    const promptReq = `In the style of ${style}, describe a single scene where a small yellow bear and a pink oblong jellybean with a teal cap are celebrating ${holiday.theme}. Keep it under 20 words.`;
    const twistRes = await textModel.generateContent(promptReq);
    const sceneDescription = twistRes.response.text().trim();

    // Get a fun fact
    const factRes = await textModel.generateContent(`Tell me one interesting fact about ${holiday.theme} in 15 words.`);
    const fact = factRes.response.text().trim();

    // Final consolidated prompt for Nano Banana 2
    const finalPrompt = `${style} style. ${sceneDescription}. 
    MANDATORY: The image must clearly display the text "${holiday.greeting.toUpperCase()}". 
    The text must be spelled perfectly and appear only once. 
    High quality, cinematic lighting.`;

    try {
        const imageModel = genAI.getGenerativeModel({ 
            model: CONFIG.IMAGE_MODEL,
            systemInstruction: "You are an expert graphic designer. You always render text perfectly without spelling errors. You only render text once per image."
        });

        const result = await imageModel.generateContent({
            contents: [{ role: 'user', parts: [{ text: finalPrompt }] }],
            generationConfig: { 
                responseMimeType: "image/png",
                seed: dayCount // Ensures consistency if re-run
            }
        });
        
        const part = result.response.candidates[0].content.parts[0];
        if (!part.inlineData) throw new Error("No image generated.");

        const imageBuffer = Buffer.from(part.inlineData.data, 'base64');
        const formData = new FormData();
        
        const payload = { 
            content: `**${dateHeader}**\n# ${holiday.theme.toUpperCase()}\n${fact}\n*Streaming now at: twitch.tv/HoneyBearSquish*` 
        };
        
        formData.set('payload_json', JSON.stringify(payload));
        formData.set('files[0]', new Blob([imageBuffer], { type: 'image/png' }), 'doodle.png');

        const discordRes = await fetch(CONFIG.DISCORD_URL, { method: 'POST', body: formData });
        
        if (discordRes.ok) {
            console.log(`✅ Success! Posted ${holiday.theme}`);
        } else {
            console.error(`❌ Discord Error: ${await discordRes.text()}`);
        }
    } catch (err) {
        console.error("💥 Fatal Error:", err);
    }
}

main();
