const path = require("path");

function likelySourceFiles(testFile){
    const base = path.basename(testFile , "test.js");
    if(base === "health")return ["src/app.js"];
    if(base === "auth"){
        return ["src/controllers/authController.js" , "src/services/authService.js" , "src/routes/authRoutes.js" , "src/models/User.js"];
    }
    const cap = base.charAt(0).toUpperCase() + base.slice(1);
    return [
        `src/controllers/${base}Controller.js`,
        `src/services/${base}Service.js`,
        `src/routes/${base}Routes.js`,
        `src/models/${cap}.js`,
    ];
}

function analyzeFailures(testResults){
    const failures = testResults.filter((t) => t.status === "failed");
    return failures.map((f) => (
        {
            file:f.file,
            title:f.title,
            message:(f.failureMessages[0]  || "").split("\n").slice(0,6).join("\n"),
            fullMessage: f.failureMessage[0] || "",
            candidateSourceFiles : likelySourceFiles(f.file),
        }
    ));
}

module.exports = { analyzeFailures , likelySourceFiles};