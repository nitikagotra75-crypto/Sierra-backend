const shared = require("./codeGenShared");
const authGen = require("./codeGenAuth");
const entityGen = require("./codeGenEntity");

function healthTests() {
  return `const request = require("supertest");
const { createApp } = require("../src/app");

const app = createApp();

describe("Health", () => {
  it("responds 200 on /health", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });
});
`;
}

function jestConfig() {
  return JSON.stringify(
    {
      testEnvironment: "node",
      testTimeout: 15000,
    },
    null,
    2
  );
}

function generateProject({ projectName, analysis }) {
  const { needsAuth, primaryEntities } = analysis;
  const files = {};

  files["package.json"] = shared.pkgJson(projectName, needsAuth);
  files[".env.example"] = shared.envExample(needsAuth);
  files["Dockerfile"] = shared.dockerfile();
  files["README.md"] = shared.readme(projectName, analysis);
  files["jest.config.json"] = jestConfig();

  files["src/app.js"] = shared.appJs({ needsAuth, primaryEntities });
  files["src/server.js"] = shared.serverJs();
  files["src/config/db.js"] = shared.dbConfig();
  files["src/middleware/errorHandler.js"] = shared.errorHandler();
  files["src/middleware/notFound.js"] = shared.notFound();

  if (needsAuth) {
    files["src/models/User.js"] = authGen.userModel();
    files["src/validators/authValidators.js"] = authGen.authValidators();
    files["src/services/authService.js"] = authGen.authService();
    files["src/controllers/authController.js"] = authGen.authController();
    files["src/routes/authRoutes.js"] = authGen.authRoutes();
    files["src/middleware/auth.js"] = authGen.authMiddleware();
    files["tests/auth.test.js"] = authGen.authTests();
  }

  for (const entity of primaryEntities) {
    const lower = entity.toLowerCase();
    files[`src/models/${entity}.js`] = entityGen.entityModel(entity, needsAuth);
    files[`src/validators/${lower}Validators.js`] = entityGen.entityValidators(entity);
    files[`src/services/${lower}Service.js`] = entityGen.entityService(entity, needsAuth);
    files[`src/controllers/${lower}Controller.js`] = entityGen.entityController(entity, needsAuth);
    files[`src/routes/${lower}Routes.js`] = entityGen.entityRoutes(entity, needsAuth);
    files[`tests/${lower}.test.js`] = entityGen.entityTests(entity, needsAuth);
  }

  files["tests/health.test.js"] = healthTests();

  return files;
}

module.exports = { generateProject };
