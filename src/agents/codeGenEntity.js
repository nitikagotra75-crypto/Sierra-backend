function pluralOf(entityLower) {
  return entityLower + (entityLower.endsWith("s") ? "es" : "s");
}

function entityModel(entity, needsAuth) {
  return `const mongoose = require("mongoose");

const ${entity.toLowerCase()}Schema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: "" },
    status: { type: String, enum: ["pending", "in-progress", "completed"], default: "pending" },
    ${needsAuth ? `owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },` : ""}
  },
  { timestamps: true }
);

module.exports = mongoose.model("${entity}", ${entity.toLowerCase()}Schema);
`;
}

function entityValidators(entity) {
  const lower = entity.toLowerCase();
  return `const { body, param } = require("express-validator");

const create${entity}Validators = [
  body("title").isString().trim().notEmpty().withMessage("title is required"),
  body("status").optional().isIn(["pending", "in-progress", "completed"]),
];

const update${entity}Validators = [
  param("id").isMongoId().withMessage("Invalid ${lower} id"),
  body("title").optional().isString().trim().notEmpty(),
  body("status").optional().isIn(["pending", "in-progress", "completed"]),
];

const id${entity}Validator = [param("id").isMongoId().withMessage("Invalid ${lower} id")];

module.exports = { create${entity}Validators, update${entity}Validators, id${entity}Validator };
`;
}

function entityService(entity, needsAuth) {
  const Model = entity;
  return `const ${Model} = require("../models/${Model}");

async function list${entity}s(${needsAuth ? "ownerId" : ""}) {
  const filter = ${needsAuth ? "{ owner: ownerId }" : "{}"};
  return ${Model}.find(filter).sort({ createdAt: -1 });
}

async function get${entity}(id${needsAuth ? ", ownerId" : ""}) {
  const filter = { _id: id${needsAuth ? ", owner: ownerId" : ""} };
  const doc = await ${Model}.findOne(filter);
  if (!doc) {
    const err = new Error("${entity} not found");
    err.statusCode = 404;
    throw err;
  }
  return doc;
}

async function create${entity}(data${needsAuth ? ", ownerId" : ""}) {
  const payload = { ...data${needsAuth ? ", owner: ownerId" : ""} };
  return ${Model}.create(payload);
}

async function update${entity}(id, data${needsAuth ? ", ownerId" : ""}) {
  const filter = { _id: id${needsAuth ? ", owner: ownerId" : ""} };
  const doc = await ${Model}.findOneAndUpdate(filter, data, { new: true, runValidators: true });
  if (!doc) {
    const err = new Error("${entity} not found");
    err.statusCode = 404;
    throw err;
  }
  return doc;
}

async function delete${entity}(id${needsAuth ? ", ownerId" : ""}) {
  const filter = { _id: id${needsAuth ? ", owner: ownerId" : ""} };
  const doc = await ${Model}.findOneAndDelete(filter);
  if (!doc) {
    const err = new Error("${entity} not found");
    err.statusCode = 404;
    throw err;
  }
  return doc;
}

module.exports = { list${entity}s, get${entity}, create${entity}, update${entity}, delete${entity} };
`;
}

function entityController(entity, needsAuth) {
  const svc = entity.toLowerCase() + "Service";
  return `const { validationResult } = require("express-validator");
const service = require("../services/${svc}");

function ownerOf(req) {
  return ${needsAuth ? "req.userId" : "undefined"};
}

async function list(req, res, next) {
  try {
    const items = await service.list${entity}s(ownerOf(req));
    res.status(200).json({ items });
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: "Validation failed", details: errors.array() });
    const item = await service.get${entity}(req.params.id, ownerOf(req));
    res.status(200).json({ item });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: "Validation failed", details: errors.array() });
    const item = await service.create${entity}(req.body, ownerOf(req));
    res.status(201).json({ item });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: "Validation failed", details: errors.array() });
    const item = await service.update${entity}(req.params.id, req.body, ownerOf(req));
    res.status(200).json({ item });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: "Validation failed", details: errors.array() });
    await service.delete${entity}(req.params.id, ownerOf(req));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { list, getOne, create, update, remove };
`;
}

function entityRoutes(entity, needsAuth) {
  const lower = entity.toLowerCase();
  return `const express = require("express");
const router = express.Router();
const controller = require("../controllers/${lower}Controller");
const { create${entity}Validators, update${entity}Validators, id${entity}Validator } = require("../validators/${lower}Validators");
${needsAuth ? `const { requireAuth } = require("../middleware/auth");` : ""}

${needsAuth ? "router.use(requireAuth);" : ""}

router.get("/", controller.list);
router.get("/:id", id${entity}Validator, controller.getOne);
router.post("/", create${entity}Validators, controller.create);
router.put("/:id", update${entity}Validators, controller.update);
router.delete("/:id", id${entity}Validator, controller.remove);

module.exports = router;
`;
}

function entityTests(entity, needsAuth) {
  const lower = entity.toLowerCase();
  const plural = pluralOf(lower);
  return `const request = require("supertest");
const mongoose = require("mongoose");
const { createApp } = require("../src/app");

const app = createApp();

beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  ${needsAuth ? "" : ""}
});

afterAll(async () => {
  await mongoose.connection.close();
});

describe("${entity} CRUD", () => {
  let token;
  let createdId;

  beforeAll(async () => {
    ${needsAuth
      ? `const email = \`${lower}_\${Date.now()}@example.com\`;
    await request(app).post("/api/auth/register").send({ email, password: "password123" });
    const loginRes = await request(app).post("/api/auth/login").send({ email, password: "password123" });
    token = loginRes.body.token;`
      : "// no auth required for this resource"}
  });

  function auth(req) {
    return ${needsAuth ? "req.set(\"Authorization\", `Bearer ${token}`)" : "req"};
  }

  it("creates a new ${lower}", async () => {
    const res = await auth(request(app).post("/api/${plural}")).send({ title: "Test ${entity}", description: "desc" });
    expect(res.status).toBe(201);
    expect(res.body.item.title).toBe("Test ${entity}");
    createdId = res.body.item._id;
  });

  it("lists ${plural}", async () => {
    const res = await auth(request(app).get("/api/${plural}"));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  it("gets a single ${lower} by id", async () => {
    const res = await auth(request(app).get(\`/api/${plural}/\${createdId}\`));
    expect(res.status).toBe(200);
    expect(res.body.item._id).toBe(createdId);
  });

  it("updates a ${lower}", async () => {
    const res = await auth(request(app).put(\`/api/${plural}/\${createdId}\`)).send({ status: "in-progress" });
    expect(res.status).toBe(200);
    expect(res.body.item.status).toBe("in-progress");
  });

  it("deletes a ${lower}", async () => {
    const res = await auth(request(app).delete(\`/api/${plural}/\${createdId}\`));
    expect(res.status).toBe(204);
  });

  it("returns 404 for a deleted ${lower}", async () => {
    const res = await auth(request(app).get(\`/api/${plural}/\${createdId}\`));
    expect(res.status).toBe(404);
  });
});
`;
}

module.exports = { pluralOf, entityModel, entityValidators, entityService, entityController, entityRoutes, entityTests };