/**
 * Inserta imágenes en la hoja: las que bajan por URL y las fórmulas LaTeX (que son imágenes SVG
 * con `customData.tuw.latex` para poder editarlas después).
 */
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import {
  generateIdFromFile,
  getDataURL,
  resizeImageFile,
} from "@excalidraw/excalidraw/data/blob";
import { newElementWith, newImageElement } from "@excalidraw/element";

import type { ExcalidrawImageElement } from "@excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { fitSize } from "./size";

import type { FetchedImage } from "../../../desktop/src/api";
import type { LatexData } from "./latex/latexSvg";
import type { LatexRender } from "./latex/renderLatex";

/** Una imagen recién insertada no ocupa más de esto por lado (el usuario la puede agrandar). */
const MAX_INSERT_SIDE = 600;
/** Las fotos grandes se reducen antes de guardarse en el archivo de la hoja. */
const MAX_STORED_SIDE = 1440;

const base64ToBytes = (b64: string): Uint8Array => {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
};

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new Error("No se pudo leer la imagen (¿está dañada?)."));
    img.src = src;
  });

/** Centro de lo que se ve ahora en pantalla, en coordenadas de la hoja. */
export const viewportCenter = (api: ExcalidrawImperativeAPI) => {
  const s = api.getAppState();
  return {
    x: s.width / 2 / s.zoom.value - s.scrollX,
    y: s.height / 2 / s.zoom.value - s.scrollY,
  };
};

const appendImageElement = (
  api: ExcalidrawImperativeAPI,
  el: ExcalidrawImageElement,
) => {
  api.updateScene({
    elements: [...api.getSceneElementsIncludingDeleted(), el],
    appState: { selectedElementIds: { [el.id]: true } } as any,
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
};

/** Imagen descargada por la app de escritorio (ya validada) → elemento en el centro de la vista. */
export const insertFetchedImage = async (
  api: ExcalidrawImperativeAPI,
  fetched: FetchedImage,
) => {
  const bytes = base64ToBytes(fetched.base64);
  let file = new File([bytes as BlobPart], fetched.name, {
    type: fetched.mimeType,
  });
  const fileId = await generateIdFromFile(file);

  // las fotos pesadas se reducen; los GIF animados y los SVG se guardan tal cual
  if (
    fetched.mimeType !== "image/svg+xml" &&
    fetched.mimeType !== "image/gif"
  ) {
    try {
      file = await resizeImageFile(file, { maxWidthOrHeight: MAX_STORED_SIDE });
    } catch {
      // si no se puede reducir, se usa la original
    }
  }
  const dataURL = await getDataURL(file);
  const img = await loadImage(dataURL);
  const natural = {
    width: img.naturalWidth || img.width || MAX_INSERT_SIDE,
    height: img.naturalHeight || img.height || MAX_INSERT_SIDE,
  };
  const size = fitSize(natural.width, natural.height, MAX_INSERT_SIDE);
  const c = viewportCenter(api);

  api.addFiles([
    { id: fileId, mimeType: file.type as any, dataURL, created: Date.now() },
  ]);
  appendImageElement(
    api,
    newImageElement({
      type: "image",
      status: "saved",
      fileId,
      x: c.x - size.width / 2,
      y: c.y - size.height / 2,
      width: size.width,
      height: size.height,
    }),
  );
};

const latexFileId = async (dataURL: string) =>
  generateIdFromFile(
    new File([dataURL], "formula.svg", { type: "image/svg+xml" }),
  );

const withLatexCustomData = (
  previous: unknown,
  data: LatexData,
  size: { width: number; height: number },
) => ({
  ...(previous as object | undefined),
  tuw: {
    ...(previous as any)?.tuw,
    latex: { ...data, naturalWidth: size.width, naturalHeight: size.height },
  },
});

export const insertLatex = async (
  api: ExcalidrawImperativeAPI,
  data: LatexData,
  render: Extract<LatexRender, { ok: true }>,
) => {
  const fileId = await latexFileId(render.dataURL);
  const c = viewportCenter(api);
  api.addFiles([
    {
      id: fileId,
      mimeType: "image/svg+xml",
      dataURL: render.dataURL as any,
      created: Date.now(),
    },
  ]);
  appendImageElement(
    api,
    newImageElement({
      type: "image",
      status: "saved",
      fileId,
      x: c.x - render.width / 2,
      y: c.y - render.height / 2,
      width: render.width,
      height: render.height,
      customData: withLatexCustomData(undefined, data, render),
    }),
  );
};

/** Reemplaza la fórmula de una imagen ya existente, conservando su centro y el factor de escala que le dio el usuario. */
export const updateLatex = async (
  api: ExcalidrawImperativeAPI,
  elementId: string,
  data: LatexData,
  render: Extract<LatexRender, { ok: true }>,
) => {
  const el = api
    .getSceneElementsIncludingDeleted()
    .find((e) => e.id === elementId);
  if (!el || el.type !== "image") {
    return;
  }
  const oldNatural = (el.customData as any)?.tuw?.latex?.naturalWidth;
  const k =
    typeof oldNatural === "number" && oldNatural > 0
      ? el.width / oldNatural
      : 1;
  const width = Math.max(1, render.width * k);
  const height = Math.max(1, render.height * k);
  const fileId = await latexFileId(render.dataURL);
  api.addFiles([
    {
      id: fileId,
      mimeType: "image/svg+xml",
      dataURL: render.dataURL as any,
      created: Date.now(),
    },
  ]);
  api.updateScene({
    elements: api.getSceneElementsIncludingDeleted().map((e) =>
      e.id === elementId
        ? newElementWith(e as ExcalidrawImageElement, {
            fileId,
            status: "saved",
            width,
            height,
            x: el.x + el.width / 2 - width / 2,
            y: el.y + el.height / 2 - height / 2,
            customData: withLatexCustomData(el.customData, data, render),
          })
        : e,
    ),
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
};
