export type PreparedPhoto = { dataUrl: string; width: number; height: number; bytes: number };

const MAX_INPUT_BYTES = 20 * 1024 * 1024;
// Limit the complete base64 payload, not just its smaller decoded JPEG.
const MAX_DATA_URL_BYTES = 2_000_000;

export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  if (file.size > MAX_INPUT_BYTES) throw new Error('This photo is over 20 MB. Choose a smaller photo or export a smaller JPEG.');
  if (file.size === 0) throw new Error('This file is empty. Choose a photo saved on your device.');
  if (file.type && !file.type.startsWith('image/')) throw new Error('Choose an image file. A JPEG or PNG photo works best.');

  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('This browser could not open that image. Export it as a JPEG or take a screenshot, then choose it again.'));
      image.src = objectUrl;
    });
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('This image has no readable dimensions. Try a JPEG or PNG instead.');
    const scale = Math.min(1, 1800 / Math.max(image.naturalWidth, image.naturalHeight));
    let width = Math.max(1, Math.round(image.naturalWidth * scale));
    let height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Your browser could not prepare this photo. Try another browser or enter the evidence as text.');
    for (let attempt = 0; attempt < 6; attempt++) {
      canvas.width = width;
      canvas.height = height;
      context.fillStyle = '#fff';
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      // Drawing into a fresh canvas copies pixels without the original EXIF metadata.
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      if (!dataUrl.startsWith('data:image/jpeg;base64,')) throw new Error('JPEG preparation is unavailable in this browser. Try another browser or enter text.');
      if (dataUrl.length <= MAX_DATA_URL_BYTES) {
        const encoded = dataUrl.slice(dataUrl.indexOf(',') + 1);
        const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
        return { dataUrl, width, height, bytes: Math.floor(encoded.length * 3 / 4) - padding };
      }
      const smaller = Math.min(0.85, Math.sqrt(MAX_DATA_URL_BYTES / dataUrl.length) * 0.94);
      width = Math.max(1, Math.floor(width * smaller));
      height = Math.max(1, Math.floor(height * smaller));
    }
    throw new Error('This photo is still too large to send. Crop to the relevant record or choose a smaller JPEG.');
  } finally {
    image.onload = null;
    image.onerror = null;
    URL.revokeObjectURL(objectUrl);
  }
}
