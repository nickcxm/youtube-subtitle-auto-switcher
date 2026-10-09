// Chrome runtime messaging is JSON-only, so encode asynchronously before sending.
export async function encodeJpeg(canvas: HTMLCanvasElement, quality = 0.85): Promise<string> {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(result => result ? resolve(result) : reject(new Error('图片编码失败')), 'image/jpeg', quality);
  });
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result)), { once: true });
    reader.addEventListener('error', () => reject(reader.error ?? new Error('图片读取失败')), { once: true });
    reader.readAsDataURL(blob);
  });
}
