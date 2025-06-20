const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config();

const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI;

    if (!mongoURI) {
      console.error("Error: MONGODB_URI is not defined in .env file.");

      process.exit(1);
    }

    await mongoose.connect(mongoURI);

    console.log("DB connected");
  } catch (error) {
    console.error("Error connecting to the database:", error.message);

    process.exit(1);
  }
};

module.exports = connectDB;