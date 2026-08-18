require('dotenv').config();
const fs = require('fs');
const path = require('path');

(async () => {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdfPath = path.join(__dirname, '..', 'BeeClass-v2.0-huong-dan-theo-vai-tro.pptx.pdf');
  const pdfBuffer = fs.readFileSync(pdfPath);
  const data = new Uint8Array(pdfBuffer);
  const doc = await pdfjsLib.getDocument({ data }).promise;

  console.log('--- TESTING SMART IMAGE SELECTION ---');

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

        if (fetchedImg && fetchedImg.data && fetchedImg.width > 50 && fetchedImg.height > 50) {
          slideImages.push({
            imgName,
            width: fetchedImg.width,
            height: fetchedImg.height,
            kind: fetchedImg.kind,
            data: fetchedImg.data,
            area: fetchedImg.width * fetchedImg.height
          });
        }
      }
    }

    // Smart Selection: If multiple images exist, filter out recurring 1000x771 background frame unless it is the only image
    let selectedImage = null;
    if (slideImages.length > 1) {
      const contentImages = slideImages.filter(img => !(img.width === 1000 && img.height === 771));
      if (contentImages.length > 0) {
        // Pick largest content image
        contentImages.sort((a, b) => b.area - a.area);
        selectedImage = contentImages[0];
      } else {
        slideImages.sort((a, b) => b.area - a.area);
        selectedImage = slideImages[0];
      }
    } else if (slideImages.length === 1) {
      selectedImage = slideImages[0];
    }

    console.log(`Slide ${String(i).padStart(2, ' ')}: Selected -> ${selectedImage ? `${selectedImage.imgName} (${selectedImage.width}x${selectedImage.height})` : 'NONE'}`);
  }

  process.exit(0);
})();
