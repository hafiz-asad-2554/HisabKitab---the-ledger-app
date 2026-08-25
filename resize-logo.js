const sharp = require('sharp');
const fs = require('fs');

async function resizeLogo() {
  const inputPath = 'assets/images/hisabkitab-logo.png';
  const tempPath = 'assets/images/hisabkitab-logo-temp.png';

  try {
    await sharp(inputPath)
      .resize({
        width: 1024,
        height: 1024,
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .toFile(tempPath);
      
    fs.renameSync(tempPath, inputPath);
    console.log('Successfully padded logo to 1024x1024 square.');
  } catch (err) {
    console.error('Error resizing image:', err);
  }
}

resizeLogo();
