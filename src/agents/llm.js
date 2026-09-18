const hasKey = !!process.env.ANTHROPIC_API_KEY;
let Anthropic = null;
let client = null;

if(hasKey){
    Anthropic = require('@anthropic-ai/sdk');
    client = new Anthropic({ apiKey:process.env.ANTHROPIC_API_KEY });
}

async function askForJSON({ system,prompt,maxTokens = 4096}){
    if(!client){
        const err = new Error("NO_LLM_KEY");
        err.code = "NO_LLM_KEY";
        throw err;
    }

    const resp = await client.messages.create({
        model:"",
        max_tokens:maxTokens,
        system,
        messages : [{ role:"user" , content:prompt }],
    });
    const text = resp.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
    const cleared = text.replace(/```json/g,"").replace(/```/g,"").trim();
    return JSON.parse(cleaned);
}

module.exports = { askForJSON , hasLLM : hasKey };