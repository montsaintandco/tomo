// 업로드 전 클라이언트 리사이즈 — 폰 사진 3~8MB가 2열 그리드 썸네일로 그대로 내려가는 것을 막는다.
// 긴 변 1600px, JPEG 0.85 (~200–400KB). 캔버스를 못 쓰는 환경(HEIC 디코드 실패 등)이면 원본 그대로.
export async function resizeImage(file: File, maxSide = 1600, quality = 0.85): Promise<Blob> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }); // EXIF 회전 반영
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 600_000) { bitmap.close(); return file; } // 이미 작으면 그대로
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
    return blob ?? file;
  } catch {
    return file;
  }
}
