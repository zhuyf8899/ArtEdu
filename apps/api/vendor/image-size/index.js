const fs = require("node:fs");

function imageSize(input) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (buffer.length < 24) throw new Error("Unsupported image or truncated image data");
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), type: "png" };
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8) throw new Error("JPEG dimensions are not supported by the safe adapter");
  throw new Error("Unsupported image type");
}

imageSize.imageSize = imageSize;
imageSize.imageSizeFromFile = async (filePath) => imageSize(fs.readFileSync(filePath));
imageSize.types = ["png"];
module.exports = imageSize;
