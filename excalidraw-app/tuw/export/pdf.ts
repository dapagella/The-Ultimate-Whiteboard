/**
 * PDF de una sola página con la hoja como imagen (sin dependencias): se arma a mano un PDF mínimo
 * con la imagen RGB comprimida (FlateDecode). La página tiene el tamaño de la hoja a 96 ppp.
 */

/** Un PDF no admite páginas de más de 14400 pt por lado. */
const MAX_PAGE_PT = 14400;
/** Tope de píxeles para no agotar la memoria con hojas enormes. */
const MAX_PIXELS = 40_000_000;

export type PdfImage = {
  widthPx: number;
  heightPx: number;
  /** Tamaño de la página en puntos (1 pt = 1/72 pulgada). */
  pageWidthPt: number;
  pageHeightPt: number;
  /** Píxeles RGB (3 bytes por píxel) comprimidos con zlib/deflate. */
  flate: Uint8Array;
};

const enc = new TextEncoder();

const num = (n: number) => String(Math.round(n * 100) / 100);

/** Arma el archivo PDF (sin tocar el DOM: se prueba en Node). */
export const buildPdf = (img: PdfImage): Uint8Array => {
  const chunks: Uint8Array[] = [];
  let offset = 0;
  const offsets: number[] = [];
  const push = (data: string | Uint8Array) => {
    const bytes = typeof data === "string" ? enc.encode(data) : data;
    chunks.push(bytes);
    offset += bytes.length;
  };
  const obj = (n: number, body: string | Uint8Array[]) => {
    offsets[n] = offset;
    push(`${n} 0 obj\n`);
    if (typeof body === "string") {
      push(body);
    } else {
      body.forEach((b) => push(b));
    }
    push("\nendobj\n");
  };

  const W = num(img.pageWidthPt);
  const H = num(img.pageHeightPt);
  const content = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;

  push("%PDF-1.4\n%âãÏÓ\n");
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  obj(
    3,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] ` +
      "/Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>",
  );
  obj(4, [
    enc.encode(
      `<< /Type /XObject /Subtype /Image /Width ${img.widthPx} /Height ${img.heightPx} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${img.flate.length} >>\nstream\n`,
    ),
    img.flate,
    enc.encode("\nendstream"),
  ]);
  obj(5, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);

  const xref = offset;
  let table = "xref\n0 6\n0000000000 65535 f \n";
  for (let n = 1; n <= 5; n++) {
    table += `${String(offsets[n]).padStart(10, "0")} 00000 n \n`;
  }
  push(table);
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(offset);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
};

/** Tamaño de página (pt) de una imagen exportada con `scale`, a 96 ppp y dentro del máximo del PDF. */
export const pageSizeFor = (
  widthPx: number,
  heightPx: number,
  scale: number,
) => {
  let w = ((widthPx / scale) * 72) / 96;
  let h = ((heightPx / scale) * 72) / 96;
  const big = Math.max(w, h);
  if (big > MAX_PAGE_PT) {
    w = (w * MAX_PAGE_PT) / big;
    h = (h * MAX_PAGE_PT) / big;
  }
  return { w, h };
};

const deflate = async (data: Uint8Array): Promise<Uint8Array> => {
  const stream = new Blob([data as BlobPart])
    .stream()
    .pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

/** Convierte el PNG exportado (fondo transparente → blanco) en un PDF; devuelve los bytes. */
export const pngToPdf = async (
  png: Blob,
  scale: number,
): Promise<Uint8Array> => {
  const bitmap = await createImageBitmap(png);
  const { width, height } = bitmap;
  const shrink = Math.min(1, Math.sqrt(MAX_PIXELS / (width * height)));
  const w = Math.max(1, Math.round(width * shrink));
  const h = Math.max(1, Math.round(height * shrink));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const rgba = ctx.getImageData(0, 0, w, h).data;
  canvas.width = canvas.height = 0; // libera memoria
  const rgb = new Uint8Array(w * h * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
    rgb[j] = rgba[i];
    rgb[j + 1] = rgba[i + 1];
    rgb[j + 2] = rgba[i + 2];
  }
  const page = pageSizeFor(width, height, scale);
  return buildPdf({
    widthPx: w,
    heightPx: h,
    pageWidthPt: page.w,
    pageHeightPt: page.h,
    flate: await deflate(rgb),
  });
};
