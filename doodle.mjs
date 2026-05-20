import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import FormData from 'form-data';

const CONFIG = {
    GEMINI_KEY: process.env.GEMINI_API_KEY,
    DISCORD_URL: process.env.DISCORD_WEBHOOK_URL,
    TEXT_MODEL: "gemini-3.1-flash-lite-preview",
    IMAGE_MODEL: "imagen-3.0-generate-002", // Optimized production image generator
    SAVE_FILE: path.join(process.cwd(), 'current_doodle.txt'),
    HISTORY_FILE: path.join(process.cwd(), 'doodle_history.json')
};

// Variety Protocol Matrices
const artStyles = [
    "Cozy 90s cartoon illustration", "Vibrant cell-shaded anime aesthetic", 
    "Chibi fantasy watercolor sketch", "Cyberpunk neon vector art", 
    "Whimsical detailed comic book scene", "3D claymation stop-motion look"
];

const compositions = [
    "Dynamic wide-angle action shot", "Cozy close-up side-by-side shot", 
    "Extreme low-angle heroic stance", "Playful top-down birds-eye view",
    "Asymmetric split-focus background composition"
];

const positioningRules = [
    "JellyBean is on the left, HoneyBear is on the right.",
    "HoneyBear is in the center foreground, JellyBean is peeking from the top right.",
    "JellyBean is in the center foreground, HoneyBear is cheering on the left side.",
    "HoneyBear is on the left, JellyBean is floating/jumping on the right wearing his cap backwards."
];

async function postToDiscord(dateTitle, holidayName, finalPrompt, imageBuffer) {
    if (!CONFIG.DISCORD_URL) throw new Error("Missing DISCORD_WEBHOOK_URL.");

    const form = new FormData();
    
    const payload = {
        embeds: [{
            title: `🎨 The Daily Squish Artist — ${dateTitle}`,
            description: `**Today's Holiday:** ${holidayName}\n\n**The Final Master Prompt:**\n\`\`\`text\n${finalPrompt}\n\`\`\``,
            color: 0x9b59b6, // Purple theme
            image: { url: 'attachment://doodle.png' }
        }]
    };

    form.append('payload_json', JSON.stringify(payload));
    form.append('files[0]', imageBuffer, { filename: 'doodle.png', contentType: 'image/png' });

    const response = await fetch(CONFIG.DISCORD_URL, {
        method: 'POST',
        body: form,
        headers: form.getHeaders()
    });

    if (!response.ok) throw new Error(`Discord Upload Failed: ${await response.text()}`);
}

async function main() {
    const now = new Date();
    const dateKey = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles' });
    const fullDate = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles' });

    // Load history for the Anti-Monotony Matrix filter
    let historyData = [];
    if (fs.existsSync(CONFIG.HISTORY_FILE)) {
        try { historyData = JSON.parse(fs.readFileSync(CONFIG.HISTORY_FILE, 'utf8')); } catch { }
    }
    const recentHolidays = historyData.slice(0, 10).map(h => h.holiday.toLowerCase());

    // Randomize style matrix values for today's run
    const pickedStyle = artStyles[Math.floor(Math.random() * artStyles.length)];
    const pickedComposition = compositions[Math.floor(Math.random() * compositions.length)];
    const pickedPosition = positioningRules[Math.floor(Math.random() * positioningRules.length)];

    // Stage 1: The Director Prompt (Holiday finder & Master Prompt builder)
    const directorPrompt = `You are an autonomous AI artist creating daily content for the HoneyBearSquish community. 
    Today's system date is: ${fullDate}.

    CRITICAL TASK:
    1. Find the most popular official holiday, unofficial holiday, internet culture milestone, or trending event for the exact date of ${dateKey}. If absolutely none exists, propose a fun "Seasonal Theme" for late May. Do not pick an entry from this recently used list: ${recentHolidays.join(", ")}.
    2. Write a single, highly-visual, descriptive master image generation paragraph based on that holiday.

    STRICT STYLE & FORMATTING RULES:
    - NO GOOGLE LOGOS: Do not include the word "Google", search bars, or multi-colored G icons. 
    - TEXT SPECIFICATION: Instruct the image model to include only the holiday title text as stylized high-contrast lettering with a heavy dark outline or drop shadow.
    - MATRIX INJECTIONS: You must weave this specific framing style into your prompt: Style: "${pickedStyle}", Composition: "${pickedComposition}", Character Layout: "${pickedPosition}".
    - CHARACTER INTEGRITY (VERBATIM): You MUST explicitly copy and paste this exact description block into the prompt actions:
      "A small, round, yellow bear with a cream-colored belly and purple eyes and nose, and a light pink oblong jellybean character wearing a backwards teal baseball cap. Both characters have exactly two arms and two legs."

    Return ONLY a raw JSON object matching this schema:
    {
      "holiday": "Name of the Holiday",
      "masterPrompt": "The complete copy-pasteable paragraph including Style, Composition, Characters, Action, Holiday, Text, Setting, Lighting, and Palette."
    }`;

    try {
        console.log(`[V6 Protocol] Analyzing Date: ${fullDate}...`);
        const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_KEY);
        
        // Step 1: Run Director logic
        const textModel = genAI.getGenerativeModel({ 
            model: CONFIG.TEXT_MODEL,
            generationConfig: { responseMimeType: "application/json" }
        });
        const textResult = await textModel.generateContent(directorPrompt);
        const data = JSON.parse(textResult.response.text());
        
        console.log(`[Step 1 Check] Holiday Identified: ${data.holiday}`);
        console.log(`[Master Prompt Built]: ${data.masterPrompt}`);

        // Step 2: Render Image using the Master Prompt
        console.log("[Step 2 Execution] Invoking Image Model...");
        const imageModel = genAI.getGenerativeModel({ 
            model: CONFIG.IMAGE_MODEL,
            generationConfig: { responseMimeType: "image/png" }
        });
        
        const imageResult = await imageModel.generateContent(data.masterPrompt);
        
        let imageBuffer = null;
        for (const part of imageResult.response.candidates[0].content.parts) {
            if (part.inlineData) {
                imageBuffer = Buffer.from(part.inlineData.data, "base64");
                break;
            }
        }

        if (!imageBuffer) throw new Error("Image buffer assignment failed.");

        // Save local workspace records (Text file written out cleanly like a JSON object)
        const recordEntry = {
            date: fullDate,
            holiday: data.holiday,
            styleMatrix: { style: pickedStyle, composition: pickedComposition },
            masterPrompt: data.masterPrompt
        };

        fs.writeFileSync(CONFIG.SAVE_FILE, JSON.stringify(recordEntry, null, 2), 'utf8');
        fs.writeFileSync('current_doodle.png', imageBuffer);
        
        historyData.unshift(recordEntry);
        fs.writeFileSync(CONFIG.HISTORY_FILE, JSON.stringify(historyData.slice(0, 100), null, 2), 'utf8');

        // Ship everything to Discord
        await postToDiscord(fullDate, data.holiday, data.masterPrompt, imageBuffer);
        console.log("[Success] V6 Broadcast Completed Successfully.");

    } catch (err) {
        console.error("💥 V6 Protocol Execution Failure:", err.message);
        process.exit(1);
    }
}

main();
