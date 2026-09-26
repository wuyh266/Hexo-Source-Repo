import { createHash } from 'node:crypto';
import { EditorError } from './content.mjs';

export const IMAGE_LIMIT = 2 * 1024 * 1024;
export function parseImage(input) {
  if (typeof input.base64 !== 'string' || input.base64.length > Math.ceil(IMAGE_LIMIT / 3) * 4 || input.base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(input.base64)) throw new EditorError(400, '图片数据无效，单张图片最多 2 MB。');
  const bytes = Buffer.from(input.base64, 'base64');
  if (bytes.toString('base64') !== input.base64) throw new EditorError(400, '图片编码无效。');
  if (!bytes.length || bytes.length > IMAGE_LIMIT) throw new EditorError(400, '图片不能为空，单张图片最多 2 MB。');
  let extension;
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) && bytes.toString('ascii', 12, 16) === 'IHDR') extension = 'png';
  else if (bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) extension = 'jpg';
  else if (bytes.length >= 10 && ['GIF87a', 'GIF89a'].includes(bytes.toString('ascii', 0, 6))) extension = 'gif';
  else if (bytes.length >= 16 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') extension = 'webp';
  if (!extension) throw new EditorError(400, '只支持 PNG、JPG、WebP、GIF 图片，不支持 SVG 或其他文件。');
  return { filename: `${createHash('sha256').update(bytes).digest('hex')}.${extension}`, base64: bytes.toString('base64') };
}

export async function uploadImage(input, store, github, config) {
  const image = parseImage(input);
  await store.limit('image-upload', 120);
  const unlock = await store.lock('repository-write');
  try {
    await github.putImage(image.filename, image.base64);
    // GitHub serves the image immediately; no need to wait for a Pages build.
    return { url: `https://raw.githubusercontent.com/${config.repository}/${encodeURIComponent(config.branch)}/source/img/uploads/${image.filename}`, public: true };
  } finally { await unlock().catch(() => {}); }
}
