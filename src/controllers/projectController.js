const projectService = require("../services/projectService");
const { subscribe } = require("../sse");

async function create(req , res , next){
    try{
        const project = await projectService.createProject(req.body);
        res.status(201).json(project);
    }catch(err){
        next(err);
    }
}

async function list(req , res , next){
    try{
        const project = await projectService.listProjects();
        res.json({ project });
    }catch(err){
        next(err);
    }
}

async function getOne(req , res , next){
    try{
        const project = await projectService.getProject(req.params.id);
        res.json(project);
    }catch(err){
        next(err);
    }
}

async function generate(req , res , next){
    try{
        await projectService.startGeneration(req.params.id);
        res.status(202).json({ started:true });
    }catch(err){
        next(err);
    }
}

function events(req , res){
    subscribe(req.params.id , res);
}

async function listFiles(req , res , next){
    try{
        const files = await projectService.listFiles(req.params.id);
        res.json({ files });
    }catch(err){
        next(err);
    }
}

async function getFile(req , res , next){
    try{
        const file = await projectService.getFile(req.params.id , req.params[0]);
        res.json({ path:file.path , content:file.content });
    }catch(err){
        next(err);
    }
}

async function testResults(req, res , next){
    try{
        const result = projectService.getStatus(req.params.id);
        res.json(result);
    }catch(err){
        next(err);
    }
}

async function status(req , res , next){
    try{
        const result = await projectService.getStatus(req.params.id);
        res.json(result);
    }catch(err){
        next(err);
    }
}

module.exports = { create , list , getOne , generate , events , listFiles , getFile , testResults , status };