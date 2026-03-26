const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const router = express.Router();
const Student = require("../modals/Student")


router.post("signUp", async(req,res))