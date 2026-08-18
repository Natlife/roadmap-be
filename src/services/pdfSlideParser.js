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
 * Evaluates whether an image buffer contains real visual content (vs solid fill/blank mask).
 */
function isContentImage(width, height, pixelBuffer, kind = 3) {
  if (!pixelBuffer || width < 40 || height < 40) return false;

  const bytesPerPixel = kind === 2 ? 3 : 4;
  const totalPixels = width * height;
  const sampleStep = Math.max(1, Math.floor(totalPixels / 2000));

  let sumR = 0, sumG = 0, sumB = 0;
  let sampleCount = 0;
  let nonTransparentCount = 0;

  for (let i = 0; i < pixelBuffer.length; i += sampleStep * bytesPerPixel) {
    const r = pixelBuffer[i];
    const g = pixelBuffer[i + 1];
    const b = pixelBuffer[i + 2];
    const a = bytesPerPixel === 4 ? pixelBuffer[i + 3] : 255;

    if (a > 15) {
      nonTransparentCount++;
      sumR += r;
      sumG += g;
      sumB += b;
      sampleCount++;
    }
  }

  if (sampleCount < 50 || (nonTransparentCount / (totalPixels / sampleStep)) < 0.05) {
    return false;
  }

  const meanR = sumR / sampleCount;
  const meanG = sumG / sampleCount;
  const meanB = sumB / sampleCount;

  let varianceSum = 0;

  for (let i = 0; i < pixelBuffer.length; i += sampleStep * bytesPerPixel) {
    const r = pixelBuffer[i];
    const g = pixelBuffer[i + 1];
    const b = pixelBuffer[i + 2];
    const a = bytesPerPixel === 4 ? pixelBuffer[i + 3] : 255;

    if (a > 15) {
      const diffR = r - meanR;
      const diffG = g - meanG;
      const diffB = b - meanB;
      varianceSum += (diffR * diffR + diffG * diffG + diffB * diffB);
    }
  }

  const colorVariance = varianceSum / sampleCount;
  return colorVariance > 200;
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
  try {
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

    const data = new Uint8Array(pdfBuffer);
    const doc = await pdfjsLib.getDocument({ data }).promise;
    const numPages = doc.numPages;

    const timestamp = Date.now();
    const uploadDir = path.join(__dirname, '..', '..', 'upload', 'slides');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const slides = [];

    for (let i = 1; i <= numPages; i++) {
      const page = await doc.getPage(i);

      // --- 1. Extract Text & Preserve Paragraph Structure ---
      const textContent = await page.getTextContent();
      const items = textContent.items;

      const textLines = [];
      let currentLine = '';
      let lastY = null;
      let lastXEnd = null;

      for (const item of items) {
        if (!item.str) continue;
        const transform = item.transform; // [scaleX, skewY, skewX, scaleY, translateX, translateY]
        const x = transform ? transform[4] : null;
        const y = transform ? transform[5] : null;
        const width = item.width || 0;

        if (lastY !== null && Math.abs(y - lastY) > 3) {
          if (currentLine.trim()) {
            textLines.push(currentLine.trim());
          }
          currentLine = item.str;
        } else {
          if (lastXEnd !== null && x !== null && x - lastXEnd > 4 && currentLine.length > 0) {
            currentLine += ' ';
          }
          currentLine += item.str;
        }

        if (y !== null) {
          lastY = y;
        }
        if (x !== null) {
          lastXEnd = x + width;
        }
      }
      if (currentLine.trim()) textLines.push(currentLine.trim());

      const rawText = textLines.join('\n');
      const htmlText = textLines.map((l) => `<p>${l}</p>`).join('');

      // --- 2. Extract Embedded Images from Page ---
      const extractedImageUrls = [];
      try {
        const opList = await page.getOperatorList();
        const validSlideImages = [];

        for (let j = 0; j < opList.fnArray.length; j++) {
          const fn = opList.fnArray[j];
          if (
            fn === pdfjsLib.OPS.paintImageXObject ||
            fn === pdfjsLib.OPS.paintJpegXObject ||
            fn === pdfjsLib.OPS.paintInlineImageXObject ||
            fn === pdfjsLib.OPS.paintImageMaskXObject
          ) {
            const imgName = opList.argsArray[j]?.[0];
            if (!imgName) continue;

            let fetchedImg = null;
            await new Promise((resolve) => {
              page.objs.get(imgName, (img) => {
                if (img) fetchedImg = img;
                resolve();
              });
            });

            if (!fetchedImg && page.commonObjs) {
              await new Promise((resolve) => {
                page.commonObjs.get(imgName, (img) => {
                  if (img) fetchedImg = img;
                  resolve();
                });
              });
            }

            if (
              fetchedImg &&
              fetchedImg.data &&
              isContentImage(fetchedImg.width, fetchedImg.height, fetchedImg.data, fetchedImg.kind)
            ) {
              const area = fetchedImg.width * fetchedImg.height;
              validSlideImages.push({ ...fetchedImg, area });
            }
          }
        }

        // Sort by visual area so main screenshot comes first
        validSlideImages.sort((a, b) => b.area - a.area);

        for (let imgIdx = 0; imgIdx < validSlideImages.length; imgIdx++) {
          const img = validSlideImages[imgIdx];
          const filename = `slide_${timestamp}_p${i}_img${imgIdx + 1}_${Math.random().toString(36).slice(2, 6)}.png`;
          const filePath = path.join(uploadDir, filename);
          const pngBuffer = createPngBuffer(img.width, img.height, img.data, img.kind);
          fs.writeFileSync(filePath, pngBuffer);
          extractedImageUrls.push(`/upload/slides/${filename}`);
        }
      } catch (imgErr) {
        console.warn(`[pdfSlideParser] Could not extract image for page ${i}:`, imgErr.message);
      }

      slides.push({
        pageIndex: i,
        title: `Slide ${i}`,
        text: rawText,
        html: htmlText,
        imageUrl: extractedImageUrls[0] || '',
        imageUrls: extractedImageUrls,
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
