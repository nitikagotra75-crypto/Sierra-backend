function validateCreateProject(req , res , next ){
    const { name , requirement } = req.body || {};
    const errors = [];
    if(!name || typeof name !== "string" || !name.trim())
        errors.push("name is required");
    if(!requirement || typeof requirement !== "string" || requirement.trim().length < 10){
        errors.push("requirement is required and should describe the backend in at least a sentence");
    }
    if(errors.length){
        return res.status(400).json({ error: "Validation failed" , details : errors });
    }
    next();

}

module.exports = { validateCreateProject };