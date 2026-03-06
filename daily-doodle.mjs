import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from 'node-fetch';
import { FormData, Blob } from 'formdata-node';

const CONFIG = {
    GEMINI_KEY: process.env.GEMINI_API_KEY,
    DISCORD_URL: process.env.DISCORD_WEBHOOK, 
    IMAGE_MODEL: "gemini-3-flash-image", // Nano Banana 2
    TEXT_MODEL: "gemini-3.1-flash-lite-preview",
    TIMEOUT_MS: 50000 
};

const BASE_VIBES = [
    "Vibrant 2D Vector Illustration, flat colors, clean bold lines", 
    "Detailed 3D Claymation digital model, soft lighting", 
    "Whimsical Watercolor painting, soft edges, pastel colors", 
    "Pop Art Comic Book style, heavy halftone dots, high contrast", 
    "Retro 1930s Rubber Hose Cartoon, black and white, bouncy", 
    "Lush Studio Ghibli inspired anime background, detailed scenery", 
    "Pixel Art 16-Bit style, crisp colors, detailed environment", 
    "Surreal dreamlike Digital Painting, impossible logic, soft brushwork", 
    "Cyberpunk Neon Synthwave style, glowing lines, dark blues", 
    "Hand-drawn Crayon and Charcoal sketch, textured strokes", 
    "Modern Papercut Art, layered paper textures, soft shadows", 
    "Ukiyo-e Japanese Woodblock print style, traditional colors", 
    "90s Nicktoon inspired aesthetic, wobbly lines, neon palette", 
    "Oil Painting on Canvas, thick impasto brushstrokes", 
    "Low-Poly 3D PS1 aesthetic, chunky polygons, pixelated textures"
];

const today = new Date();
const dateISO = today.toISOString().split('T')[0];
const dateHeader = today.toLocaleDateString('en-US', { 
    month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles' 
});

async function getHolidayContext() {
    const monthDay = `${today.getMonth() + 1}-${today.getDate()}`;
    const HOLIDAY_CALENDAR = {
        "3-6": { theme: "National Oreo Cookie Day", greeting: "Happy Oreo Day!" },
        "3-10": { theme: "Mario Day (Mar10)", greeting: "It's-a Mario Day!" },
        "4-22": { theme: "Jelly Bean Day", greeting: "Happy Jelly Bean Day!" }
    };

    if (HOLIDAY_CALENDAR[monthDay]) return HOLIDAY_CALENDAR[monthDay];

    try {
        const res = await fetch(`https://www.checkiday.com/api/v3/events?date=${dateISO}`);
        const data = await res.json();
        if (data.events?.length > 0) {
            return { theme: data.events[0].name, greeting: `Happy ${data.events[0].name}!` };
        }
    } catch (e) { console.warn("Holiday API unreachable."); }

    const vibes = ["Sunday Funday", "Motivation Monday", "Taco Tuesday", "Wild Wednesday", "Retro Thursday", "Pizza Friday", "Gaming Saturday"];
    return { theme: vibes[today.getDay()], greeting: `Happy ${vibes[today.getDay()]}` };
}

async function main() {
    console.log("🚀 Starting Daily Doodle Bot...");
    const context = await getHolidayContext();
    const safeGreeting = context.greeting || "Have a great day!";
    const safeTheme = context.theme || "Today";

    const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_KEY);
    const textModel = genAI.getGenerativeModel({ model: CONFIG.TEXT_MODEL });
    
    // Style rotation (repeats every 15 days)
    const dayCount = Math.floor(today.getTime() / (1000 * 60 * 60 * 24));
    const baseStyle = BASE_VIBES[dayCount % BASE_VIBES.length];

    const twistResult = await textModel.generateContent(`Base style: '${baseStyle}'. Holiday: '${safeTheme}'. Write a 10-word artistic twist. No code, just prose.`);
    const artTwist = (await twistResult.response).text().trim();

    const factResult = await textModel.generateContent(`One short fact about ${safeTheme} under 20 words.`);
    const fact = (await factResult.response).text().trim();

    // Character descriptions only
    const characterContext = `A small, round, yellow bear with a cream belly and purple eyes, standing next to a pink oblong jellybean character wearing a backwards teal baseball cap.`;
    const artPrompt = `${baseStyle}, ${artTwist}. Feature ${characterContext} celebrating ${safeTheme}. STRICT: Render the text '${safeGreeting.toUpperCase()}' EXACTLY ONCE.`;

    console.log(`🎨 Style: ${baseStyle}\n✨ Twist: ${artTwist}`);

    let imageBuffer;
    try {
        console.log("🎨 Generating with Nano Banana 2...");
        const imageModel = genAI.getGenerativeModel({ model: CONFIG.IMAGE_MODEL });
        
        // Use the proper 2026 image generation method
        const result = await imageModel.generateContent({
            contents: [{ role: 'user', parts: [{ text: artPrompt }] }],
            generationConfig: { responseMimeType: "image/png" }
        });
        
        const response = await result.response;
        const part = response.candidates[0].content.parts[0];

        if (part.inlineData) {
            imageBuffer = Buffer.from(part.inlineData.data, 'base64');
            console.log("✅ Nano Banana 2 Image Generated!");
        } else {
            throw new Error("No inlineData found in response.");
        }
    } catch (err) {
        console.warn(`⚠️ Nano Banana 2 failed: ${err.message}. Falling back to Pollinations...`);
        const pollRes = await fetch(`https://image.pollinations.ai/prompt/${encodeURIComponent(artPrompt)}?width=1024&height=1024&nologo=true&seed=${dayCount}`);
        imageBuffer = Buffer.from(await pollRes.arrayBuffer());
    }

    // Validation to prevent the 16kb "broken" file issue
    if (!imageBuffer || imageBuffer.length < 5000) {
        throw new Error("Invalid image buffer: Image is too small or empty.");
    }

    const formData = new FormData();
    const payload = { 
        content: `**${dateHeader}**\n# ${safeTheme.toUpperCase()}\n${fact}\n*Style: ${baseStyle}*` 
    };
    
    formData.set('payload_json', JSON.stringify(payload));
    const fileBlob = new Blob([imageBuffer], { type: 'image/png' });
    formData.set('files[0]', fileBlob, 'daily_doodle.png');

    const res = await fetch(CONFIG.DISCORD_URL, { method: 'POST', body: formData });

    if (res.ok) {
        console.log(`🎉 Daily Doodle posted!`);
    } else {
        console.error(`❌ Discord Error: ${await res.text()}`);
    }
}

main().catch(err => {
    console.error("💥 Critical Bot Error:", err);
    process.exit(1);
});
