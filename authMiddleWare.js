const jwt = require("jsonwebtoken")

const authMiddleWare = (req,res,next)=>{
    try {
        const token = req.header("Authorization")?.split(" ")[1];

        if(!token){
           return res.status(401).json({success: false, message: "No token provided" })
        }
        const decode = jwt.verify(token, process.env.JWT_SECRET)
        req.user = decode;
        next()
    } catch (error) {
        return res.status(401).json({ success: false, message: "Invalid or expired token" });
    }
}
module.exports = authMiddleWare