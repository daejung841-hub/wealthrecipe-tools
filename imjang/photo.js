/*
 * 사진 처리 — 저장 전에 긴 변을 줄이고 JPEG 로 다시 만든다.
 * canvas 로 새로 인코딩하므로 원본의 EXIF(촬영 위치·기기 정보 등)는 결과 파일에 남지 않는다.
 * 폰 사진의 회전 정보(EXIF 방향)는 그릴 때 한 번 적용해서, 결과 픽셀 자체가 올바른 방향이다.
 */
(function (root) {
  'use strict';

  // 긴 변이 maxEdge 를 넘을 때만 비율을 유지해 줄인다(작은 사진은 키우지 않는다).
  function fitSize(w, h, maxEdge) {
    const long = Math.max(w, h);
    if (long <= maxEdge) return { w, h, scale: 1 };
    const scale = maxEdge / long;
    return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)), scale };
  }

  // JPEG 바이트에 EXIF(APP1 'Exif') 또는 GPS 표식이 있는지 훑어본다(검증용).
  function hasExif(bytes) {
    if (!bytes || bytes[0] !== 0xff || bytes[1] !== 0xd8) return false;
    let i = 2;
    while (i + 4 < bytes.length) {
      if (bytes[i] !== 0xff) break;
      const marker = bytes[i + 1], len = (bytes[i + 2] << 8) | bytes[i + 3];
      if (marker === 0xe1 && bytes[i + 4] === 0x45 && bytes[i + 5] === 0x78 && bytes[i + 6] === 0x69 && bytes[i + 7] === 0x66) return true; // 'Exif'
      if (marker === 0xda) break; // 이미지 데이터 시작
      i += 2 + len;
    }
    return false;
  }

  async function decode(file) {
    if (root.createImageBitmap) {
      try { const bmp = await root.createImageBitmap(file, { imageOrientation: 'from-image' }); return { src: bmp, w: bmp.width, h: bmp.height, close: () => bmp.close && bmp.close() }; } catch (e) { /* 아래 <img> 방식으로 */ }
    }
    const url = URL.createObjectURL(file);
    try {
      const img = new Image(); img.decoding = 'async'; img.src = url;
      if (img.decode) await img.decode(); else await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('사진을 읽지 못했어요')); });
      return { src: img, w: img.naturalWidth, h: img.naturalHeight, close: () => {} };
    } finally { setTimeout(() => URL.revokeObjectURL(url), 0); }
  }

  // file → {blob, w, h, bytes, origBytes}
  async function process(file, opts) {
    const maxEdge = (opts && opts.maxEdge) || 1280, quality = (opts && opts.quality) || 0.7;
    const d = await decode(file);
    try {
      const f = fitSize(d.w, d.h, maxEdge);
      const canvas = document.createElement('canvas'); canvas.width = f.w; canvas.height = f.h;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, f.w, f.h); // 투명 영역은 흰색으로(JPEG 는 투명을 못 씀)
      ctx.drawImage(d.src, 0, 0, f.w, f.h);
      const blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('사진을 변환하지 못했어요'))), 'image/jpeg', quality));
      canvas.width = canvas.height = 0; // 메모리 바로 해제
      return { blob, w: f.w, h: f.h, bytes: blob.size, origBytes: file.size };
    } finally { d.close(); }
  }

  // JPEG 바이트를 살펴본다: 형식 확인, 크기(SOF 표식), EXIF 유무. 디코딩 없이 머리말만 읽는다(가져오기 검증용).
  function inspectJpeg(bytes) {
    const out = { isJpeg: false, w: 0, h: 0, hasExif: false };
    if (!bytes || bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return out;
    out.isJpeg = true; out.hasExif = hasExif(bytes);
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) { i++; continue; }
      const m = bytes[i + 1];
      if (m === 0xff) { i++; continue; }
      if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) { i += 2; continue; }
      const len = (bytes[i + 2] << 8) | bytes[i + 3];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) { out.h = (bytes[i + 5] << 8) | bytes[i + 6]; out.w = (bytes[i + 7] << 8) | bytes[i + 8]; break; }
      if (m === 0xda) break;
      i += 2 + len;
    }
    return out;
  }

  const api = { fitSize, hasExif, inspectJpeg, process };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ImjangPhoto = api;
})(typeof window !== 'undefined' ? window : globalThis);
