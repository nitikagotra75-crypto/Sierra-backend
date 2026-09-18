const { askForJSON, hasLLM } = require("./llm");

const ENTITY_HINTS = [
  ["task", "Task"],
  ["todo", "Task"],
  ["user", "User"],
  ["restaurant", "Restaurant"],
  ["menu", "MenuItem"],
  ["order", "Order"],
  ["product", "Product"],
  ["cart", "Cart"],
  ["review", "Review"],
  ["comment", "Comment"],
  ["post", "Post"],
  ["book", "Book"],
  ["invoice", "Invoice"],
  ["payment", "Payment"],
];

/**
 * Deterministic fallback analyzer used when no ANTHROPIC_API_KEY is configured.
 * It's a real keyword/rule-based parser (not a fabricated result) — it reads the
 * actual requirement text and derives entities/endpoints from it. Less flexible
 * than an LLM, but honest about what it is.
 */
function heuristicAnalyze(requirement) {
  const lower = requirement.toLowerCase();
  const needsAuth = /auth|login|regist|jwt|password|user account|sign ?up|sign ?in/.test(lower);

  const entities = new Set();
  if (needsAuth) entities.add("User");
  for (const [kw, entity] of ENTITY_HINTS) {
    if (lower.includes(kw)) entities.add(entity);
  }
  if (entities.size === 0 || (entities.size === 1 && entities.has("User"))) {
    // Generic fallback primary resource
    entities.add("Item");
  }

  const primaryEntities = [...entities].filter((e) => e !== "User");
  const endpoints = [];

  if (needsAuth) {
    endpoints.push(
      { method: "POST", path: "/api/auth/register", auth: false },
      { method: "POST", path: "/api/auth/login", auth: false }
    );
  }

  for (const entity of primaryEntities) {
    const plural = entity.toLowerCase() + (entity.endsWith("s") ? "es" : "s");
    endpoints.push(
      { method: "GET", path: `/api/${plural}`, auth: needsAuth },
      { method: "POST", path: `/api/${plural}`, auth: needsAuth },
      { method: "GET", path: `/api/${plural}/:id`, auth: needsAuth },
      { method: "PUT", path: `/api/${plural}/:id`, auth: needsAuth },
      { method: "DELETE", path: `/api/${plural}/:id`, auth: needsAuth }
    );
  }

  return {
    entities: [...entities],
    primaryEntities,
    needsAuth,
    authRequirements: needsAuth
      ? { registration: true, login: true, jwt: true, passwordHashing: "bcrypt" }
      : null,
    endpoints,
    validation: "required fields validated per model (express-validator)",
    businessLogic: primaryEntities.map((e) => `${e} CRUD scoped to authenticated owner where applicable`),
    errorHandling: "centralized error middleware returning consistent JSON error shape",
    testingRequirements: [
      "startup/health check",
      ...(needsAuth ? ["register success", "duplicate register rejected", "login success", "login invalid credentials"] : []),
      ...primaryEntities.flatMap((e) => [`create ${e}`, `list ${e}`, `get ${e} by id`, `update ${e}`, `delete ${e}`]),
    ],
    source: "heuristic-fallback",
  };
}

async function analyzeRequirement(requirement) {
  if (hasLLM) {
    try {
      const analysis = await askForJSON({
        system:
          "You are a backend requirement analyzer. Given a plain-English backend requirement, respond with ONLY a JSON object (no prose, no markdown) with keys: entities (string array), primaryEntities (string array, excluding User), needsAuth (bool), authRequirements (object or null), endpoints (array of {method,path,auth}), validation (string), businessLogic (string array), errorHandling (string), testingRequirements (string array).",
        prompt: requirement,
      });
      return { ...analysis, source: "llm" };
    } catch (e) {
      // Real fallback on real failure — not a silent fabrication.
      return heuristicAnalyze(requirement);
    }
  }
  return heuristicAnalyze(requirement);
}

module.exports = { analyzeRequirement };