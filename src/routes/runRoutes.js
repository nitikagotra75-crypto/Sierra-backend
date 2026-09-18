const express = require("express");
const router = express.Router();
const controller = require("../controllers/runsController");

router.get("/" , controller.recent);

module.exports = router;