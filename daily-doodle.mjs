import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from 'node-fetch';
import { FormData, Blob } from 'formdata-node';

const CONFIG = {
    GEMINI_KEY: process.env.GEMINI_API_KEY,
    // Using your full secret which includes the thread_id
    DISCORD_URL: process.env.DISCORD_WEBHOOK, 
    IMAGE_MODEL: "gemini-3-flash-image", 
    TEXT_MODEL: "gemini-2.5-flash",
    TIMEOUT_MS: 50000 
};

// 15 distinct styles to ensure > 2 weeks of variety
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
    
    // Curated Priority Calendar
    const HOLIDAY_CALENDAR = {
        "1-1": { theme: "New Year's Day", greet: "Happy New Year!" },
        "2-14": { theme: "Valentine's Day", greet: "Be My Valentine" },
        "2-27": { theme: "Pokémon Day", greet: "Happy Pokémon Day!" }, 
        "3-5": { theme: "National Cheese Doodle Day", greet: "Happy Cheese Doodle Day!" },
        "3-10": { theme: "Mario Day (Mar10)", greet: "It's-a Mario Day!" },
        "4-20": { theme: "4/20 Celebration", greet: "Blaze It" },
        "4-22": { theme: "Jelly Bean Day", greet: "Happy Jelly Bean Day!" },
        "10-31": { theme: "Halloween", greet: "Happy Halloween!" },
        "12-25": { theme: "Christmas Day", greet: "Merry Christmas" }
    };

    if (HOLIDAY_CALENDAR[monthDay]) return HOLIDAY_CALENDAR[monthDay];

    // Fallback to external API for "Fake Internet Holidays"
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
    const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_KEY);
    const textModel = genAI.getGenerativeModel({ model: CONFIG.TEXT_MODEL });
    
    // Determine Base Style (15-day rotation)
    const dayCount = Math.floor(today.getTime() / (1000 * 60 * 60 * 24));
    const baseStyle = BASE_VIBES[dayCount % BASE_VIBES.length];

    // Generate the Daily Twist
    const twistPrompt = `Base style: '${baseStyle}'. Holiday: '${context.theme}'. Write a 10-word artistic twist to make today's scene unique. No code, just prose.`;
    const twistResult = await textModel.generateContent(twistPrompt);
    const artTwist = twistResult.response.text().trim();

    // Generate Fun Fact
    const factPrompt = `Give me one fun, short fact about ${context.theme}. Keep it under 20 words.`;
    const factResult = await textModel.generateContent(factPrompt);
    const fact = factResult.response.text().trim();

    // Image Prompt Construction
    const characterContext = `A small, round, yellow bear with a cream belly and purple eyes (HoneyBear), standing next to a pink pill-shaped jellybean wearing a backwards teal baseball cap (JellyBean).`;
    const artPrompt = `${baseStyle}, ${artTwist}. Feature ${characterContext} celebrating ${context.theme}. STRICT: Render the text '${context.greeting.toUpperCase()}' EXACTLY ONCE. No streamer rooms. High resolution.`;

    console.log(`🎨 Style: ${baseStyle}\n✨ Twist: ${artTwist}`);

    let imageBuffer;
    try {
        const imageModel = genAI.getGenerativeModel({ model: CONFIG.IMAGE_MODEL });
        const result = await imageModel.generateContent(artPrompt);
        const base64Data = result.response.candidates[0].content.parts[0].inlineData.data;
        imageBuffer = Buffer.from(base64Data, 'base64');
    } catch (err) {
        console.log("⚠️ Image generation failed or timed out. Falling back to Pollinations...");
        const pollUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(artPrompt)}?width=1024&height=1024&nologo=true`;
        const pollRes = await fetch(pollUrl);
        imageBuffer = await pollRes.arrayBuffer();
    }

    // Post to Discord
    const formData = new FormData();
    const payload = { content: `**${dateHeader}**\n# ${context.theme.toUpperCase()}\n${fact}` };
    formData.set('payload_json', JSON.stringify(payload));
    formData.set('files[0]', new Blob([imageBuffer], { type: 'image/png' }), 'daily_doodle.png');

    const res = await fetch(CONFIG.DISCORD_URL, { method: 'POST', body: formData });
    if (res.ok) {
        console.log(`🎉 Posted doodle for ${context.theme} to Discord!`);
    } else {
        console.error("❌ Failed to post to Discord:", await res.text());
    }
}

main().catch(err => {
    console.error("💥 Critical Bot Error:", err);
    process.exit(1);
});
