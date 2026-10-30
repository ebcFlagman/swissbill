import { createCanvas } from '@napi-rs/canvas';
import jsQR from 'jsqr';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

export interface InspectedPdf {
  numPages: number;
  /** Seitengrösse in Punkten (A4 = 595.28 x 841.89) */
  pageSizes: { width: number; height: number }[];
  /** Text je Seite, durch Leerzeichen verbunden */
  texts: string[];
  /** Rastert die Seite und dekodiert den ersten QR-Code. `null`, wenn keiner gefunden wird. */
  decodeQr(pageNumber: number): Promise<string | null>;
  destroy(): Promise<void>;
}

/** Liest ein PDF (Text, Seitengrösse) und dekodiert dessen QR-Code durch Rastern mit pdf.js und jsQR. */
export async function inspectPdf(buffer: Buffer): Promise<InspectedPdf> {
  const loadingTask = getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    verbosity: 0,
  });
  const doc = await loadingTask.promise;

  const pageSizes: InspectedPdf['pageSizes'] = [];
  const texts: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const viewport = page.getViewport({ scale: 1 });
    pageSizes.push({ width: Math.round(viewport.width * 100) / 100, height: Math.round(viewport.height * 100) / 100 });
    const content = await page.getTextContent();
    texts.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' '));
  }

  return {
    numPages: doc.numPages,
    pageSizes,
    texts,
    async decodeQr(pageNumber) {
      const page = await doc.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 4 });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const context = canvas.getContext('2d');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({
        canvasContext: context as unknown as CanvasRenderingContext2D,
        canvas: canvas as unknown as HTMLCanvasElement,
        viewport,
      }).promise;
      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(image.data, image.width, image.height);
      return code ? code.data : null;
    },
    async destroy() {
      await loadingTask.destroy();
    },
  };
}
