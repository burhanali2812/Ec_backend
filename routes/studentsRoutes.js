const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const router = express.Router();
const Student = require("../modals/Student")
const authMiddleWare = require("../authMiddleWare");


router.post("/signUp", authMiddleWare, async(req,res)=>{
    const {name, contact, email, gender, address,classInfo,fatherName, fatherContact} = req.body;
    if(!name || !contact || !email || !gender || !address || !classInfo || !fatherName){
        return res.status(400).json({ message: "All fields are required", success: false });
    }
    //rollnumber generation logic: ECA-10001, ECA-10002 , ECA(for academy) ECS(for school) + 5 digit number starting from 10001
    const institutionPrefix = classInfo.toLowerCase().includes("academy") ? "ECA" : "ECS";
    const lastStudent = await Student.findOne({ classInfo }).sort({ createdAt: -1 });
    let rollNumber;
    if (lastStudent && lastStudent.rollNumber) {
        const lastRollNum = parseInt(lastStudent.rollNumber.split("-")[1]);
        rollNumber = `${institutionPrefix}-${lastRollNum + 1}`;
    } else {
        rollNumber = `${institutionPrefix}-10001`;
    }   
    // Default password logic: rollNumber + @ + first 3 letters of name
    const password = rollNumber + "@" + name.slice(0, 3);
    try {
        // Check if student already exists
        let student = await Student.findOne({ email, rollNumber });
        if (student) {
            return res.status(400).json({ message: "Student already exists on this email or roll number", success: false });
        }
        // Create new student
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        student = new Student({ name, contact, email, gender, address, classInfo, fatherName, fatherContact, password: hashedPassword, rollNumber });
        await student.save();
        res.status(201).json({ message: "Student created successfully", success: true });
    } catch (error) {
        res.status(500).json({ message: "Server error", success: false });  
}});

router.post("/login", async(req,res)=>{
    const {institutionPrefix, rollNumber, password} = req.body;
    let rollNumberFull;
    if(institutionPrefix && rollNumber){
        rollNumberFull = `${institutionPrefix}-${rollNumber}`;
    } else {
        return res.status(400).json({ message: "Institution prefix and roll number are required", success: false });
    }
    try {
        // Check if student exists
        const student = await Student.findOne({ rollNumber: rollNumberFull });
        if (!student) {
            return res.status(400).json({ message: "No student found with this roll number", success: false });
        }
        // Check password
        const isMatch = await bcrypt.compare(password, student.password);
        if (!isMatch) {
            return res.status(400).json({ message: "Invalid credentials", success: false });
        }   
        // Generate token        const token = jwt.sign({ id: student._id }, process.env.JWT_SECRET, { expiresIn: "1h" });
        res.json({ token, success: true, message: "Login successful" });
    } catch (error) {
        res.status(500).json({ message: "Server error", success: false });
    }   
    

})