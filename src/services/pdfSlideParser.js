const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { ApiError } = require('../middleware/error');

/**
 * Pure Node.js PNG encoder to convert raw PDF image pixel buffer to PNG file.
 */
function createPngBuffer(width, height, pixelBuffer, kind = 3) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);


  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const body = Buffer.concat([typeBuf, data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body) >>> 0, 0);
    return Buffer.concat([len, body, crc]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // Bit depth 8

  // ColorType 2 = RGB (3 bytes/pixel), ColorType 6 = RGBA (4 bytes/pixel)
  const bytesPerPixel = kind === 2 ? 3 : 4;
  ihdr[9] = kind === 2 ? 2 : 6;

  const lineSize = width * bytesPerPixel;
  const scanlines = Buffer.alloc((lineSize + 1) * height);
  const src = Buffer.isBuffer(pixelBuffer) ? pixelBuffer : Buffer.from(pixelBuffer);

  for (let y = 0; y < height; y++) {
    scanlines[y * (lineSize + 1)] = 0; // Filter type 0 (None)
    const srcStart = y * lineSize;
    const srcEnd = (y + 1) * lineSize;
    if (srcEnd <= src.length) {
      src.copy(scanlines, y * (lineSize + 1) + 1, srcStart, srcEnd);
    }
  }

  const idatData = zlib.deflateSync(scanlines);
  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', idatData),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Parses an uploaded PDF slide deck buffer:
 * 1. Extracts text line by line for each page.
 * 2. Extracts embedded slide images from each page and saves them into upload/slides/.
 * 3. Returns array of slides with matched text and image URLs.
 */
async function parsePdfSlides(pdfBuffer) {
  if (!pdfBuffer || !pdfBuffer.length) {
    throw ApiError.badRequest('No PDF data provided');
  }

  const uploadDir = path.join(__dirname, '..', '..', 'upload', 'slides');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  try {
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const data = new Uint8Array(pdfBuffer);
    const doc = await pdfjsLib.getDocument({ data }).promise;
    const numPages = doc.numPages;
    const slides = [];

    const timestamp = Date.now();

    for (let i = 1; i <= numPages; i++) {
      const page = await doc.getPage(i);

      // --- 1. Extract Page Text ---
      const content = await page.getTextContent();
      const textLines = [];
      let currentLine = '';
      let lastY = null;
      let lastXEnd = null;

      for (const item of content.items) {
        if (!item.str && item.str !== ' ') continue;
        const x = item.transform ? item.transform[4] : null;
        const y = item.transform ? item.transform[5] : null;
        const width = item.width || 0;

        if (lastY !== null && Math.abs(y - lastY) > 5) {
          if (currentLine.trim()) textLines.push(currentLine.trim());
          currentLine = '';
          lastXEnd = null;
        }

        // Insert space only when spatial distance between text items on the same line exceeds 4px (prevents word fragmentation on Vietnamese PDF fonts)
        let needSpace = false;
        if (
          currentLine.length > 0 &&
          !currentLine.endsWith(' ') &&
          !item.str.startsWith(' ')
        ) {
          if (lastXEnd !== null && x !== null && x - lastXEnd > 4) {
            needSpace = true;
          }
        }

        currentLine += (needSpace ? ' ' : '') + item.str;
        lastY = y;
        if (x !== null) {
          lastXEnd = x + width;
        }
      }
      if (currentLine.trim()) textLines.push(currentLine.trim());

      const rawText = textLines.join('\n');
      const htmlText = textLines.map((l) => `<p>${l}</p>`).join('');

      // --- 2. Extract Embedded Image from Page ---
      let slideImageUrl = '';
      try {
        const opList = await page.getOperatorList();
        let largestImage = null;

        for (let j = 0; j < opList.fnArray.length; j++) {
          const fn = opList.fnArray[j];
          if (
            fn === pdfjsLib.OPS.paintImageXObject ||
            fn === pdfjsLib.OPS.paintJpegXObject ||
            fn === pdfjsLib.OPS.paintInlineImageXObject
          ) {
            const imgName = opList.argsArray[j]?.[0];
            if (!imgName) continue;

            await new Promise((resolve) => {
              page.objs.get(imgName, (img) => {
                if (img && img.data && img.width > 50 && img.height > 50) {
                  const area = img.width * img.height;
                  if (!largestImage || area > largestImage.area) {
                    largestImage = { ...img, area };
                  }
                }
                resolve();
              });
            });
          }
        }

        if (largestImage && largestImage.data) {
          const filename = `slide_${timestamp}_p${i}_${Math.random().toString(36).slice(2, 6)}.png`;
          const filePath = path.join(uploadDir, filename);
          const pngBuffer = createPngBuffer(
            largestImage.width,
            largestImage.height,
            largestImage.data,
            largestImage.kind
          );
          fs.writeFileSync(filePath, pngBuffer);
          slideImageUrl = `/upload/slides/${filename}`;
        }
      } catch (imgErr) {
        console.warn(`[pdfSlideParser] Could not extract image for page ${i}:`, imgErr.message);
      }

      slides.push({
        pageIndex: i,
        title: `Slide ${i}`,
        text: rawText,
        html: htmlText,
        imageUrl: slideImageUrl,
      });
    }

    return {
      numPages,
      slides,
    };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw ApiError.badRequest(`Could not parse PDF file: ${err.message}`);
  }
}

module.exports = { parsePdfSlides };
