require('dotenv').config();
const fs = require('fs');
const path = require('path');

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

(async () => {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdfPath = path.join(__dirname, '..', 'BeeClass-v2.0-huong-dan-theo-vai-tro.pptx.pdf');
  const pdfBuffer = fs.readFileSync(pdfPath);
  const data = new Uint8Array(pdfBuffer);
  const doc = await pdfjsLib.getDocument({ data }).promise;

  console.log('--- ADVANCED PIXEL VARIANCE MULTI-IMAGE ANALYSIS ---');

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const opList = await page.getOperatorList();
    const slideImages = [];

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

        if (fetchedImg && fetchedImg.data) {
          const isValidContent = isContentImage(fetchedImg.width, fetchedImg.height, fetchedImg.data, fetchedImg.kind);
          slideImages.push({
            imgName,
            width: fetchedImg.width,
            height: fetchedImg.height,
            isValidContent
          });
        }
      }
    }

    const validContentImgs = slideImages.filter(img => img.isValidContent);
    console.log(`Slide ${String(i).padStart(2, ' ')}: Found ${slideImages.length} raw images ➔ Filtered ${validContentImgs.length} VALID CONTENT IMAGES`);
    validContentImgs.forEach((img, idx) => {
      console.log(`   [Img ${idx + 1}] ${img.imgName} (${img.width}x${img.height})`);
    });
  }

  process.exit(0);
})();
