import express from "express";
import mongoose from "mongoose";
import bodyParser from "body-parser";
import bcrypt from "bcrypt";
import cors from "cors";
import dotenv from "dotenv";

const app = express();
dotenv.config();
const port = process.env.PORT || 4000;

app.use(
  cors({
    origin: process.env.CLIENT_WEB ,
    methods: ["POST", "GET", "PATCH", "UPDATE", "DELETE"],
  })
);

mongoose.connect(
  process.env.MONGODB_URI || "mongodb://localhost:27017/formsDB"
);

const userSchema = new mongoose.Schema({
  username: String,
  password: String,
  token: String,
  formId: String,
  responses: [{ type: mongoose.Schema.Types.ObjectId, ref: "Response" }],
});

const User = mongoose.model("User", userSchema);

app.use(bodyParser.json());

app.post("/register", async (req, res) => {
  // console.log(req.body);
  try {
    const { username, password } = req.body;

    const hashedPassword = await bcrypt.hash(password, 10);

    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ error: "User already exists" });
    }

    const newUser = new User({
      username,
      password: hashedPassword,
    });
    await newUser.save();

    res
      .status(201)
      .json({ message: "User registered successfully", token: newUser._id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const passwordMatch = bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    await user.save();

    res.json({ token: user._id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

const authenticateUser = async (req, res, next) => {
  try {
    const bearerHeader = req.headers["authorization"];
    if (typeof bearerHeader !== "undefined") {
      const bearerToken = bearerHeader.split(" ")[1];

      const user = await User.findOne({ _id: bearerToken });
      if (!user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      req.user = user;
      req.token = bearerToken;

      next();
    } else {
      res.status(401).json({ error: "Unauthorized" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};
const formSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  formData: [{ type: mongoose.Schema.Types.Mixed }],
  title: String,
  responses: [{ type: mongoose.Schema.Types.ObjectId, ref: "Response" }],
});

const Form = mongoose.model("Form", formSchema);
app.get("/getForms", authenticateUser, async (req, res) => {
  try {
    const forms = await Form.find({ userId: req.user._id });

    res.json({ forms });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});
app.get("/getFormData/:formId", authenticateUser, async (req, res) => {
  try {
    const formId = req.params.formId;
    const formData = await Form.findById(formId);

    if (formData) {
      res.json(formData);
    } else {
      res.status(404).json({ message: "Form not found" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.post("/updateFormData/:id", authenticateUser, async (req, res) => {
  try {
    const { formData, title } = req.body;
    const formId = req.params.id;

    const updatedForm = await Form.findByIdAndUpdate(
      formId,
      {
        formData: formData,
        title: title,
      },
      { new: true }
    );

    if (!updatedForm) {
      return res.status(404).json({ error: "Form not found" });
    }

    res.json({ message: "Form data updated successfully", updatedForm });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.post("/addFormData", authenticateUser, async (req, res) => {
  try {
    const { formData, title } = req.body;
    if (!req.user) {
      return res.status(404).json({ error: "Form not found for the user" });
    }

    const form = new Form({
      userId: req.token,
      formData: formData,
      title: title,
    });
    await form.save();

    res.json({ message: "Form data added successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});
app.delete("/deleteFormData/:id", authenticateUser, async (req, res) => {
  try {
    const formId = req.params.id;

    const deletedForm = await Form.findByIdAndDelete({ _id: formId });

    if (!deletedForm) {
      return res.status(404).json({ error: "Form not found" });
    }

    res.json({ message: "Form data deleted successfully", deletedForm });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.get("/response/getForms/:id", async (req, res) => {
  try {
    const formId = req.params.id;
    const formData = await Form.findById(formId);
    if (formData) {
      res.json(formData);
    } else {
      res.status(404).json({ message: "Form not found" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

const responseSchema = new mongoose.Schema({
  formId: { type: mongoose.Schema.Types.ObjectId, ref: "Form" },
  responseData: { type: mongoose.Schema.Types.Mixed },
  name: String,
});

const Response = mongoose.model("Response", responseSchema);

app.post("/addFormResponse/:formId", async (req, res) => {
  try {
    const { responseData, name } = req.body;
    const formId = req.params.formId;

    const newResponse = new Response({
      formId: formId,
      responseData: responseData,
      name: name,
    });

    await newResponse.save();

    const form = await Form.findById(formId);

    if (!form) {
      return res.status(404).json({ error: "Form not found" });
    }

    form.responses.push(newResponse._id);
    await form.save();

    res.json({ message: "Form response added successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
