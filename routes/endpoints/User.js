require('dotenv').config();
const User = require("../../models/user");
const multer = require('multer');
const bcrypt = require('bcrypt');
const jwt = require("jsonwebtoken");
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, './uploads/')
    },
    filename: function (req, file, cb) {
        cb(null, new Date().getMilliseconds() + file.originalname);
    }
});
const { tokenCallback } = require('../../functions/token');
const upload = multer({ storage: storage }).single('image');


const { verifyToken } = tokenCallback()

let routes = (app) => {
    app.post("/register", async (req, res) => {
        try {
            const { firstname, lastname, email, password, phone, role, username, referalLink } = req.body;
            
            
            if (!firstname || !lastname || !email || !password)
                return res.status(400).json({ msg: "Please fill in all fields, one or more fileds are empty!" })

            if (!validateEmail(email))
                return res.status(400).json({ msg: "Please enter a valid email address!" })

            const user = await User.findOne({ email })
            if (user) return res.status(400).json({ msg: "This email already exists, please use another email address!" })

            const referral = await User.findOne({ username:referalLink })
            if (referalLink.length > 1 && !referral) return res.status(400).json({ msg: "This user does not exists, please use another referral address!" })

            const usernamer = await User.findOne({ username })
            if (usernamer) return res.status(400).json({ msg: "This username already exists, please use another email address!" })

            if (password.length < 8)
                return res.status(400).json({ msg: "Password must be atleaast 8 characters long!" })

            const passwordHash = await bcrypt.hash(password, 12)

            const newUser = {
                firstname, lastname, email, password: passwordHash, phone, role, username, referalLink
            }
            let user_ = new User(newUser);
            await user_.save();
            res.status(200).json({ msg: "Registration Successful, Please proceed to login" })

        }
        catch (err) {
            console.log('error o')
            return res.status(500).json({ msg: err.message });
        }

    });

    app.post("/register/referral/:id", async (req, res) => {
        try {
            const { firstname, lastname, email, password, phone, role } = req.body;
            if (!firstname || !lastname || !email || !password)
                return res.status(400).json({ msg: "Please fill in all fields, one or more fileds are empty!" })

            if (!validateEmail(email))
                return res.status(400).json({ msg: "Please enter a valid email address!" })

            const user = await User.findOne({ email })
            if (user) return res.status(400).json({ msg: "This email already exists, please use another email address!" })

            if (password.length < 8)
                return res.status(400).json({ msg: "Password must be atleaast 8 characters long!" })


            const referral = await User.findOne({ _id: req.params.id })

            const passwordHash = await bcrypt.hash(password, 12)

            const newUser = {
                firstname, lastname, email, password: passwordHash, phone, role
            }
            let user_ = new User(newUser)
            user_.referalLink = "/register/referral/" + user_._id
            referral.referrals.push(user_._id)
            await referral.save()
            await user_.save();
            res.status(200).json({ msg: "Registration Successful, Please proceed to login" })

        }
        catch (err) {
            console.log('error o')
            return res.status(500).json({ msg: err.message });
        }

    });

   
    app.get("/users", async (req, res) => {


        const page = parseInt(req.query.limit) / 10 - 1 || 0;
        const limit = parseInt(req.query.limit) || 10;
        const search = req.query.search || "";
        const responses = verifyToken({ authToken: req.header('authorization') })
        if (responses.data.role === "admin") {
            try {
                let counts = await User.find(({ email: { $regex: search, $options: "i" }, role: "user" })).count()
                let users = await User.find(({ email: { $regex: search, $options: "i" }, role: "user" })).limit(limit).skip(page).sort({ createdAt: -1 })
                res.json({ data: { users, pageNumber: Math.round((counts / 10) + 0.4) } })
            }
            catch (err) {
                res.status(500).send(err)
            }
        } else {
            res.status(401).send("you are not authorize to access this feature")
        }
    });


    app.get("/users/referral", async (req, res) => {


        const responses = verifyToken({ authToken: req.header('authorization') })

        try {
            let users = await User.find({ referalLink: responses.data.username, role:"user" })
            res.json(users)
        }
        catch (err) {
            res.status(500).send(err)
        }
    });

    app.put('/user/:id', async (req, res) => {
        try {
            let update = req.body;
            let user = await User.updateOne({ _id: req.params.id }, update, { returnOriginal: false });
            return res.json(user)
        }
        catch (err) {
            res.status(500).send(err)
            throw err
        }
    });

    app.get("/user/profile", async (req, res) => {
        const responses = verifyToken({ authToken: req.header('authorization') })

        try {
            let user = await User.findOne({ _id: responses.data.id })
                .populate("referrals", "firstname lastname email")
            res.json(user)
        }
        catch (err) {
            res.status(500).send(err)
        }
    });

    app.delete('/user/:id', async (req, res) => {
        try {
            await User.deleteOne({ _id: req.params.id })
            res.json({ msg: "User Deleted" })
        }
        catch (err) {
            res.status(500).send(err)
        }
    });

    app.post("/login", async (req, res) => {
        try {
            const { email, password } = req.body
            const user = await User.findOne({ email })
            if (!user) return res.status(400).json({ msg: "This email does not exist." })

            const isMatch = await bcrypt.compare(password, user.password)
            if (!isMatch) return res.status(400).json({ msg: "Password is incorrect." })
            await User.updateOne({ email }, { status: "active" }, { returnOriginal: false })
            const token = createAccessToken({ id: user._id, role: user.role, username: user.username })

            const refresh_token = createRefreshToken({ id: user._id })
            res.cookie('refreshtoken', refresh_token, {
                httpOnly: true,
                path: '/user/refresh_token',
                maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
            })

            res.json({
                msg: "Login successful!",
                userID: user._id,
                access_token: token, 
                username: user.username
            })
        }
        catch (err) {
            res.status(500).send(err);
        }
    });

    app.post("/logout/:id", async (req, res) => {
        try {
            await User.updateOne({ _id: req.params.id }, { status: "inactive" }, { returnOriginal: false })
            res.clearCookie('refreshtoken', { path: '/user/refresh_token' })
            return res.json({ msg: "Logged out." })
        }
        catch (err) {
            res.status(500).send(err);
        }
    });
};

function validateEmail(email) {
    const re = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    return re.test(email);
};

function createAccessToken(payload) {
    return jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '7d' })
};

function createRefreshToken(payload) {
    return jwt.sign(payload, process.env.REFRESH_TOKEN_SECRET, { expiresIn: '7d' })
};

module.exports = routes;