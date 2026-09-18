require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { connectDB } = require("./db");
const projectRoutes = require("./routes/projectRoutes");
const runRoutes = require("./routes/runRoutes");
const { errorHandler } = require("./middleware/errorHandler");

async function main(){
    const dbInfo = await connectDB();
    global.__SIERRA_MEMDB_URI__ = dbInfo.ephemeral ? dbInfo.uri : null;

    const app = express();
    app.use(cors());
    app.use(express.json());

    app.get("/health" , (req , res) => res.json({ status: " ok"}));
    app.use("/api/projects" , projectRoutes );
    app.use("/api/runs" , runRoutes );
    app.use(errorHandler);

    const PORT = process.env.PORT || 5001;
    app.listen(PORT , () => {
        console.log(`[Sierra] server listening on port ${PORT}`);
    });
}

main().catch((err) => {
    console.error("[Sierra] failed to start" , err);
    process.exit(1);
});
