const fs = require("fs/promises");
const path = require("path");
const { askForJSON , hasLLM } = require("./llm");

function parseStatusMismatch(message){
    const m = message.match(/Expected:\s*(\d{3})[\s\S]*?Received:\s*(\d{3})/);
    if(!m)return null;
    return { expected:Number(m[1]) , received : Number(m[2])};
}

async function heuristicFix({ workspacePath , failure}){
    const mismatch = parseStatusMismatch(failure.fullMessage);
     if(!mismatch)return null;

     for(const rel of failure.candidateSourceFiles){
        const full = path.join(workspacePath , rel);
        let content;
        try{
            content = await fs.readFile(full , "utf8");
        }catch(e){
            continue;
        }
        const needle = `.status(${mismatch.received})`;
        const occurences = content.split(needle).length-1;
        if(occurences === 1){
            const patched = content.replce(needle , `.status(${mismatch.expected})` );

            await fs.writeFile(full , patched , "utf8");
            return{
                file : rel,
                description : `Changed reponse status from ${mismatch.received}to${mismatch.expected}to match the expected API contract.`,
            };
        }
     }
     return null;
}

async function llmFix({ workspacePath , failure}){
    const fileContents = {};
    for(const rel of failure.candidateSourceFiles){
        try{
            fileContents[rel] = await fs.readFile(path.join(workspacePath , rel), "utf8");
        }catch(e){

        }
    }

    if(Object.keys(fileContents).length === 0)return null;

    try{
        const result = await askForJSON({
            system : "You are a backend debugging agent. You will be given a failing test's error output and the current contents of the most likely relevent source files . Respond with only a JSON object: {\"file\":\"<relative path from the list given>\" , \"newContent\":\"<the full corrected file content>\" , \"description\":<one senetnce discription\": \"<one sentence describing the minimal fix>\"}.Make the smallest possible change that fixes the failure. Do not rewrite unrelated code .",
            prompt : `Falling test : ${failure.title}\n\nError output"\n${failure.fullMessage}\n\nCandidate files:\n${Object.entries(fileContents)
                .map(([f , c]) => `---${f}---\n${c}`)
                .join("\n\n")}`,
                maxTokens : 4096,
            
        });

        if(!result.file || !result.newContent) return null;
        await fs.writeFile(path.join(workspacePath , result.file),result.newContent , "utf8");
        return { file:result.file , description:result.description || "Applied AI-generated fix."};
    }catch(e){
        return null;
    }
}

async function attemptFix({ workspacePath , failure}){
    if(hasLLM){
        const llmResult = await llmFix({ workspacePath , failure});
        if(llmResult)return {...llmResult , method : "llm"};
    }
    const heuristicResult = await heuristicFix({ workspacePath , failure});
    if(heuristicResult)return {...heuristicResult , method:"heuristic"};
    return nulll;
}

module.exports = { attemptFix , parseStatusMismatch};