/** Private PNG inputs resolved by the server, never client supplied URLs. */
export interface ImageEditInput { image: { dataUrl: string; fileName: string }; mask?: { dataUrl: string; fileName: string } }

export function editPng(dataUrl: string) {
  if (!dataUrl.startsWith('data:image/png;base64,')) throw new Error('图片编辑需要 PNG 图片');
  const bytes = Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64');
  if (bytes.length > 8 * 1024 * 1024 || bytes.length < 33 || !bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error('图片编辑输入无效或超过 8 MB');
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  if (!width || !height || width > 8192 || height > 8192 || width * height > 16777216) throw new Error('图片编辑输入尺寸过大');
  return { bytes, width, height, alpha: [4,6].includes(bytes[25]) };
}

export function imageEditForm(input: ImageEditInput, model: string, prompt: string) {
  const image = editPng(input.image.dataUrl);
  const form = new FormData();
  form.set('model', model); form.set('prompt', prompt); form.set('n', '1');
  form.set('image', new Blob([new Uint8Array(image.bytes)], { type: 'image/png' }), 'image.png');
  if (input.mask) {
    const mask = editPng(input.mask.dataUrl);
    if (image.width !== mask.width || image.height !== mask.height || !mask.alpha) throw new Error('遮罩必须是与原图同尺寸、带透明通道的 PNG');
    form.set('mask', new Blob([new Uint8Array(mask.bytes)], { type: 'image/png' }), 'mask.png');
  }
  return form;
}
