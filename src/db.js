const mongoose = require("mongoose");

async function connectDB(){
    const uri = process.env.MONGODB_URI;

    if(uri){
        await mongoose.connect(uri);
        console.log(`[db] Connected to real MongoDB at ${uri}`);
        return { uri , ephemeral:false};
    }

    console.log("[db] MONGODB_URI not set attempting to start an in-memory MongoDB instance (mongodb-memory-server , a real mongod binary , ephemeral storage).");
    try{
        const { MongoMemoryServer } = require("mongodb-memory-server");
        const mem = await MongoMemoryServer.create();
        const memUri = mem.getUri();
        await mongoose.connect(memUri);
        console.log(`[db] Connected to in-memory MongoDB at ${memUri}`);
        return { uri:memUri , ephemeral:true , server : mem , local : false };
    }catch(err){
        console.warn(
            "[db] Could not obtain a real MongoDB instance in this environment" + 
            `(${err.message}).Falling back to an in-memory JS store for`  + 
            "Sierra's own state only (see src/localStorage.js) This does NOT" + 
            "affect the generated backend's own real MongoDB/Mongoose code __ it only" + 
            "means the generated backend's own DB-dependent tests cannot be fully" + 
            "verified in THIS sandbox without a real MongoDB reachable at MONGODB_URI."
        );
        global__SIERRA_LOCAL_MODE__ = true;
        return { uri:null , ephemeral:true , local : true };
    }
}

module.exports = { connectDB };