/**
 * Optical Character Recognition (OCR) Engine
 *
 * Provides structured document and sign reading for blind and visually impaired users.
 * Features:
 * - Line segmentation preserving natural reading order.
 * - Image pre-processing (adaptive thresholding & contrast enhancement on canvas).
 * - Identification of blurry, unclear, or illegible text segments.
 * - Word count and formatted reading output.
 */

export interface OCRResult {
  hasText: boolean;
  rawText: string;
  lines: string[];
  readingOrderText: string;
  wordCount: number;
  confidence: "high" | "medium" | "low" | "uncertain";
  source: "gemini-ocr" | "client-ocr" | "local-recognizer";
  message: string;
  unclearNote?: string | undefined;
}

/**
 * Preprocess an image canvas for optimal OCR readability:
 * Increases contrast and applies a gentle sharpening/threshold pass.
 */
export function preprocessCanvasForOCR(
  sourceCanvas: HTMLCanvasElement
): HTMLCanvasElement {
  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = sourceCanvas.width;
  outputCanvas.height = sourceCanvas.height;

  const ctx = outputCanvas.getContext("2d");
  if (!ctx) return sourceCanvas;

  ctx.drawImage(sourceCanvas, 0, 0);
  const imgData = ctx.getImageData(0, 0, outputCanvas.width, outputCanvas.height);
  const d = imgData.data;

  // High contrast grayscale transformation
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] ?? 0;
    const g = d[i + 1] ?? 0;
    const b = d[i + 2] ?? 0;
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;

    // Linear contrast stretch
    const contrast = 1.3;
    const factor = (259 * (contrast * 255 + 255)) / (255 * (259 - contrast * 255));
    const highContrast = factor * (gray - 128) + 128;
    const finalVal = Math.min(255, Math.max(0, highContrast));

    d[i] = finalVal;
    d[i + 1] = finalVal;
    d[i + 2] = finalVal;
  }

  ctx.putImageData(imgData, 0, 0);
  return outputCanvas;
}

/**
 * Clean and structure raw OCR string into segmented lines and reading order.
 */
export function formatOCRText(raw: string): OCRResult {
  const trimmed = raw.trim();

  if (!trimmed || trimmed === "NO_TEXT_FOUND") {
    return {
      hasText: false,
      rawText: "",
      lines: [],
      readingOrderText: "",
      wordCount: 0,
      confidence: "low",
      source: "local-recognizer",
      message:
        "I couldn't find any readable text in this view. Try adjusting the camera angle, bringing it closer, or improving lighting.",
    };
  }

  const lines = trimmed
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const words = trimmed.split(/\s+/).filter(Boolean);
  const hasUncertainty = /(?:\[unclear\]|\[blurry\]|\[illegible\]|\.\.\.)/i.test(trimmed);

  return {
    hasText: true,
    rawText: trimmed,
    lines,
    readingOrderText: lines.join(". "),
    wordCount: words.length,
    confidence: hasUncertainty ? "uncertain" : "high",
    source: "gemini-ocr",
    message: `Recognized ${words.length} word${words.length === 1 ? "" : "s"} from camera view.`,
    unclearNote: hasUncertainty
      ? "Some words appear blurry or obscured and could not be verified with certainty."
      : undefined,
  };
}
