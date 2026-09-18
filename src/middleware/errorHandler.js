function errorHandler(err , req , res , next){
    const statusCode = Number.isInteger(err.statusCode)?err.statusCode:500;
    if(statusCode >= 500)console.error(err);
    res.status(statusCode).json({ error:err.message || "Internal Server Error"});
}

module.exports = { errorHandler };