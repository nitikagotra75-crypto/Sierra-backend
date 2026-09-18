const projectService = require("../services/projectService");

async function recent(req , res , next){
    try{
        const runs = await projectService.listRecentRuns();
        res.json({ runs });
    }catch(err){
        next(err);
    }
}

module.exports = { recent };