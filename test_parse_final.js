const fs = require('fs');
const path = require('path');
const pdfSlideParser = require('./src/services/pdfSlideParser');

(async () => {
  const pdfBuffer = fs.readFileSync(path.join(__dirname, '..', 'BeeClass-v2.0-huong-dan-theo-vai-tro.pptx.pdf'));
  const res = await pdfSlideParser.parsePdfSlides(pdfBuffer);
  console.log('--- TEST PARSE ALL SLIDES MULTI-IMAGE RESULTS ---');
  console.log('Total Slides:', res.slides.length);
  res.slides.forEach((s) => {
    console.log(`Slide ${String(s.pageIndex).padStart(2, ' ')}: imageUrls count = ${s.imageUrls.length} | Primary: ${s.imageUrl || 'NONE'}`);
  });
  process.exit(0);
})();
