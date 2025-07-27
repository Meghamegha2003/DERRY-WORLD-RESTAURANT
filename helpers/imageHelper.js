const fs = require("fs");
const path = require("path");

const saveBase64Image = async (base64Image, fileName, folderPath) => {
  try {
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }

    const imageBuffer = Buffer.from(base64Image.split(",")[1], "base64");
    const filePath = path.join(folderPath, fileName);

    fs.writeFileSync(filePath, imageBuffer);
    return `/${fileName}`;
  } catch (error) {
    console.error("Error saving base64 image:", error);
    throw new Error("Failed to save image");
  }
};

module.exports = { saveBase64Image };