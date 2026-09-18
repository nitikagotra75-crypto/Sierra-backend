function planArchitecture(analysis){
    const {primaryEntities , needsAuth } = analysis;

    const files = [
        "package.json",
        "env.example",
        "Dockerfile",
        "README.md",
        "src/app.js",
        "src/server.js",
        "src/config/db.js",
        "src/middleware/errorHandler.js",
        "src/middleware/notFound.js",
    ];

    if(needsAuth){
        files.push(
            "src/models/User.js",
            "src/routes/authRoutes.js",
            "src/controllers/authControllers.js",
            "src/services/authService.js",
            "src/middleware/auth.js",
            "src/validators/authValidators.js",
            "tests/auth.test.js"
        );
    }

    for(const entity of primaryEntities){
        const lower = entity.toLowerCase();
        files.push(
            `src/models/${entity}.js`,
            `src/routes/${lower}Routes.js`,
            `src/controllers/${lower}Controller.js`,
            `src/services/${lower}Service.js`,
            `src/validators/${lower}Validators.js`,
            `tests/${lower}.test.js`
        );
    }

    files.push("tests/health.test.js" , "tests/setup/js");

    return {
        style:"modular MVP (routes -> controllers->services->models)",
        folders : ["src.config" , "src/controllers" , "src/models" , "src/routes" , "src/services" , "src/middleware" , "src/validators" , "tests"],
        files,
        conventions:{
            errorHandling : "centralized errorHandler middleware , services throw {statusCode , message}" , 
            auth: needsAuth ? "JWT bearer token , bcrypt password hashing" : "none",
            database : "MongoDB via Mongoose , connection in src/config/db.js",
        },

    };
}

module.exports = { planArchitecture};