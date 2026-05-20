import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import FormData from 'form-data';

const CONFIG = {
    GEMINI_KEY: process.env.GEMINI_API_KEY,
    DISCORD_URL: process.env.DISCORD_WEBHOOK_URL,
    TEXT_MODEL: "gemini-2.0-flash", // Upgraded to stable 2.0 Flash for logic
    IMAGE_MODEL: "imagen-3.0-generate-001", // Official AI Studio Imagen 3 endpoint
    SAVE_FILE: path.join(process.cwd(), 'current_doodle.txt'),
    HISTORY_FILE: path.join(process.cwd(), 'doodle_history.json'),
    THREAD_ID: "1475685722341245239" 
};

// --- THE VARIETY PROTOCOL MATRICES ---
const artStyles = [
    "Cozy 90s cartoon illustration style drawing", 
    "Vibrant cell-shaded anime aesthetic illustration", 
    "Chibi fantasy watercolor sketch look", 
    "Cyberpunk neon vector art masterpiece", 
    "Whimsical detailed comic book scene style drawing", 
    "3D claymation stop-motion look scene"
];

const compositions = [
    "Dynamic wide-angle action shot framing", 
    "Cozy close-up side-by-side shot framing", 
    "Extreme low-angle heroic stance perspective framing", 
    "Playful top-down birds-eye view perspective layout",
    "Asymmetric split-focus background composition layout"
];

const positioningRules = [
    "The pink character wearing his cap backwards is standing on the left side, and the yellow bear is standing on the right side.",
    "The yellow bear is in the center foreground smiling, while the pink character wearing his cap backwards is peeking playfully from the top right background.",
    "The pink character wearing his cap backwards is in the center foreground, while the yellow bear is cheering enthusiastically on the left side background.",
    "The yellow bear is on the left side, and the pink character wearing his cap backwards is floating/jumping dynamically on the right side."
];

async function postToDiscord(dateTitle, holidayName, finalPrompt, imageBuffer) {
    if (!CONFIG.DISCORD_URL) throw new Error("Missing DISCORD_WEBHOOK_URL environment variable.");

    const form = new FormData();
    
    const payload = {
        embeds: [{
            title: `🎨 The Daily Squish Artist (V6 Variety Protocol) — ${dateTitle}`,
            description: `**Today's Holiday:** ${holidayName}\n\n**The Final Master Prompt:**\n\`\`\`text\n${finalPrompt}\n\`\`\``,
            color: 0x9b59b6, 
            image: { url: 'attachment://doodle.jpg' }
        }]
    };

    form.append('payload_json', JSON.stringify(payload));
    // Ensure contentType is image/jpeg for Imagen 3 outputs
    form.append('files[0]', imageBuffer, { filename: 'doodle.jpg', contentType: 'image/jpeg' });

    const webhookUrlWithThread = `${CONFIG.DISCORD_URL}?thread_id=${CONFIG.THREAD_ID}`;

    const response = await fetch(webhookUrlWithThread, {
        method: 'POST',
        body: form,
        headers: form.getHeaders()
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Discord Upload Failed: ${response.status} - ${errorText}`);
    }
}

async function main() {
    const now = new Date();
    // Enforcing Pacific Time consistently for the bot
    const dateOptions = { month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles' };
    const fullOptions = { ...dateOptions, year: 'numeric' };
    
    const dateKey = now.toLocaleDateString('en-US', dateOptions);
    const fullDate = now.toLocaleDateString('en-US', fullOptions);

    let historyData = [];
    if (fs.existsSync(CONFIG.HISTORY_FILE)) {
        try { historyData = JSON.parse(fs.readFileSync(CONFIG.HISTORY_FILE, 'utf8')); } catch { }
    }
    const recentHolidays = historyData.slice(0, 10).map(h => h.holiday.toLowerCase());

    const pickedStyle = artStyles[Math.floor(Math.random() * artStyles.length)];
    const pickedComposition = compositions[Math.floor(Math.random() * compositions.length)];
    const pickedPosition = positioningRules[Math.floor(Math.random() * positioningRules.length)];

    // STEP 1: The Director Prompt
    const directorPrompt = `You are an autonomous AI artist creating daily content for the HoneyBearSquish community. 
    Today's system date is: ${fullDate}.

    CRITICAL TASK:
    1. Find the most popular official holiday, unofficial holiday, internet culture milestone, or trending event for the exact date of ${dateKey}. If absolutely none exists, propose a fun "Seasonal Theme" suitable for this time of the year. Do not pick an entry from this recently used list: ${recentHolidays.join(", ")}.
    2. Write a single, highly-visual, descriptive master image generation paragraph based on that holiday theme.

    STRICT STYLE, TEXT, & ANTI-MONOTONY PROTOCOLS:
    - NO GOOGLE LOGOS: Do not include the word "Google", search bars, or multi-colored G icons anywhere. No Google branding elements.
    - TEXT SPECIFICATION: Instruct the image model to include only the holiday title text as stylized high-contrast lettering with a single, solid color per word and a heavy dark outline or heavy drop shadow.
    - MATRIX INJECTIONS: You must weave this specific framing combination style cleanly into your scene description text: Style: "${pickedStyle}", Composition: "${pickedComposition}", Character Layout: "${pickedPosition}".
    - CHARACTER INTEGRITY (VERBATIM EXPLICIT DESCRIPTION): You MUST explicitly include this exact block text when describing the characters in action:
      "A small, round, yellow bear with a cream-colored belly and purple eyes and nose, and a light pink oblong jellybean character wearing a backwards teal baseball cap. Both characters have exactly two arms and two legs."

    Return ONLY a raw JSON object matching this schema:
    {
      "holiday": "Name of the Holiday",
      "masterPrompt": "The complete copy-pasteable paragraph including Style, Composition, Characters, Action, Holiday, Text, Setting, Lighting, and Palette."
    }`;

    try {
        console.log(`[V6 Protocol] Initiating Stage 1 Analysis for: ${fullDate}...`);
        const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_KEY);
        
        const textModel = genAI.getGenerativeModel({ 
            model: CONFIG.TEXT_MODEL,
            generationConfig: { responseMimeType: "application/json" }
        });
        const textResult = await textModel.generateContent(directorPrompt);
        
        // Defensive cleanup: Strip markdown formatting if AI includes it
        let rawJsonText = textResult.response.text().trim();
        rawJsonText = rawJsonText.replace(/^```json/i, '').replace(/```$/i, '').trim();
        const data = JSON.parse(rawJsonText);
        
        console.log(`[Step 1 Verified] Holiday Chosen: ${data.holiday}`);
        console.log(`[Master Prompt Built]: ${data.masterPrompt}`);

        // STEP 2: The Execution (Direct REST API Call to Imagen 3)
        console.log("[Step 2 Executing] Invoking Direct Imagen API...");
        
        const imageUrl = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.IMAGE_MODEL}:predict`;
        const imagePayload = {
            instances: [{ prompt: data.masterPrompt }],
            parameters: {
                sampleCount: 1,
                aspectRatio: "1:1" // Keeps it a perfect square for daily doodles
            }
        };

        const imageResponse = await fetch(imageUrl, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'x-goog-api-key': CONFIG.GEMINI_KEY
            },
            body: JSON.stringify(imagePayload)
        });

        const imageResultJson = await imageResponse.json();

        if (!imageResponse.ok) {
            throw new Error(`Imagen API Failed: ${JSON.stringify(imageResultJson)}`);
        }

        const rawBase64 = imageResultJson.predictions?.[0]?.bytesBase64Encoded;
        if (!rawBase64) throw new Error("Image binary conversion failed or returned empty.");
        
        const imageBuffer = Buffer.from(rawBase64, "base64");

        // Save records locally
        const recordEntry = {
            date: fullDate,
            holiday: data.holiday,
            styleMatrix: { style: pickedStyle, composition: pickedComposition },
            masterPrompt: data.masterPrompt
        };

        fs.writeFileSync(CONFIG.SAVE_FILE, JSON.stringify(recordEntry, null, 2), 'utf8');
        fs.writeFileSync('current_doodle.jpg', imageBuffer);
        
        historyData.unshift(recordEntry);
        fs.writeFileSync(CONFIG.HISTORY_FILE, JSON.stringify(historyData.slice(0, 100), null, 2), 'utf8');

        // Post to Discord
        console.log("[Discord] Pushing artwork payload to targeted thread...");
        await postToDiscord(fullDate, data.holiday, data.masterPrompt, imageBuffer);
        console.log("[Success] V6 Broadcast Process Completed.");

    } catch (err) {
        console.error("💥 V6 Protocol Execution Failure:", err.message);
        process.exit(1);
    }
}

main();
