const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Admin = require("../modals/Admin");
const router = express.Router();


router.post("/signUp", async(req,res)=>{
    const {email, password} = req.body;
    try {
        // Check if admin already exists
        let admin = await Admin.findOne({ email });
        if (admin) {
            return res.status(400).json({ message: "Admin already exists" });
        }   
        // Create new admin
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        admin = new Admin({ email, password: hashedPassword  });
        await admin.save();
        res.status(201).json({ message: "Admin created successfully" });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
});


module.exports = router;
