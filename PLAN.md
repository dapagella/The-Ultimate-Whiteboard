# PLAN — The Ultimate Whiteboard

Fork de Excalidraw (MIT) como **app de escritorio (Electron) con carpetas y hojas en disco**, herramientas de ejes, trazos tipo LibreOffice Impress, fondos de hoja, LaTeX y soporte de tabletas.

- Upstream: `https://github.com/excalidraw/excalidraw` — commit base `b55c9ee` (clon superficial, remoto `upstream`). Para un fork en GitHub: crear el repo propio y agregarlo como `origin`.
- Licencia: MIT verificada (`LICENSE`, © 2020 Excalidraw). Se conserva sin cambios. Créditos en `README.md`; README original en `docs/EXCALIDRAW_README.md`.

---

## Etapa 0 — Hecho

- [x] Clonar Excalidraw, remoto `upstream`, verificar MIT, conservar `LICENSE` y créditos.
- [x] Renombrar: `<title>` y meta tags (`excalidraw-app/index.html`), manifest PWA (`excalidraw-app/vite.config.mts`), `README.md`, logo de la pantalla de bienvenida (`excalidraw-app/components/AppWelcomeScreen.tsx` + `.tuw-logo` en `excalidraw-app/index.scss`).
- [x] Auditoría del código (abajo).

---

## 1. Auditoría del código

Monorepo Yarn 1 (workspaces). Vite para la app, esbuild para los paquetes, Vitest para tests.

| Área | Dónde está | Notas |
| --- | --- | --- |
| **App (shell)** | `excalidraw-app/App.tsx` | Monta `<Excalidraw>`, carga escena inicial, colaboración, menú, sidebar, Excalidraw+, AI. |
| **Editor (núcleo)** | `packages/excalidraw/components/App.tsx` (~11.500 líneas) + `App.*.ts` (`App.drawshape.ts`, `App.clipboard.ts`, `App.pan.ts`, `App.selection.ts`, etc.) | Eventos de puntero, herramientas, pegado, drop, imágenes. Es el archivo más delicado para mergear con upstream. |
| **Estado del editor** | `packages/excalidraw/appState.ts`, `packages/excalidraw/types.ts` (`AppState`) | `gridModeEnabled`, `gridSize`, `gridStep`, `viewBackgroundColor`, `penMode`, `penDetected`, `currentItemStrokeVariability`. |
| **Modelo de elementos** | `packages/element/src/types.ts`, `newElement.ts`, `mutateElement.ts`, `Scene.ts`, `groups.ts` | Cada elemento tiene `version`, `versionNonce`, `updated`, `groupIds`, `customData?: Record<string, any>` (clave para nuestras extensiones sin tipos nuevos). |
| **Herramientas** | `packages/common/src/constants.ts` (`TOOL_TYPE`), `packages/excalidraw/components/Tools.tsx`, `Toolbar.tsx`, `MobileToolbar.tsx`, `packages/excalidraw/eraser/` | Freedraw = `freedraw`, flechas = `arrow`. |
| **Acciones / atajos** | `packages/excalidraw/actions/*` (`manager.tsx`, `register.ts`, `actionProperties.tsx`, `actionCanvas.tsx`, `actionExport.tsx`, `actionToggleGridMode.tsx`) | Patrón para registrar acciones nuevas (presets de trazo, insertar eje, LaTeX). |
| **Renderizado** | `packages/excalidraw/renderer/staticScene.ts` (fondo + `strokeGrid`), `renderer/helpers.ts` (pinta `viewBackgroundColor`), `renderer/interactiveScene.ts` (selección/handles), `renderer/staticSvgScene.ts` (SVG), `packages/element/src/renderElement.ts` (dibujo por elemento, opacidad), `packages/element/src/shape.ts` (rough.js + freedraw con perfect-freehand y `pressures`/`simulatePressure`), `packages/excalidraw/components/canvases/*` | Fondos y modo multiply se tocan acá. |
| **Exportación** | `packages/excalidraw/scene/export.ts` (`exportScene`, `exportToClipboard`, `renderGrid: false`), `packages/excalidraw/data/index.ts` (`exportCanvas`), `data/json.ts` (`serializeAsJSON`, `saveAsJSON`), `components/ImageExportDialog.tsx`, `JSONExportDialog.tsx`, `packages/utils/` | PNG/SVG/JSON ya existen; hay que sumar fondos de hoja, multiply y LaTeX. |
| **Pegar / arrastrar / imágenes** | `packages/excalidraw/clipboard.ts` (detecta `imageUrl` en HTML pegado), `App.tsx` → `pasteFromClipboard`, `handleAppOnDrop`, `initializeImage`; `packages/excalidraw/data/blob.ts`, `data/image.ts` | Ctrl+V de imagen y drag&drop de archivos ya funcionan; falta "insertar por URL" explícito. |
| **Persistencia local** | `excalidraw-app/data/LocalData.ts` (escena en `localStorage`, archivos en IndexedDB con `idb-keyval`), `excalidraw-app/data/localStorage.ts`, `tabSync.ts`, `FileManager.ts`, `packages/excalidraw/data/restore.ts`, `data/reconcile.ts` | Una sola escena por navegador. Se reemplaza por "hoja actual" de Supabase con caché en IndexedDB. |
| **Persistencia remota** | `excalidraw-app/data/firebase.ts` (Firestore + Storage, escenas cifradas de salas), `firebaseSDK.ts`, `excalidraw-app/data/index.ts` (`exportToBackend`/`importFromBackend` contra `json.excalidraw.com`), `firebase-project/` | **Usa Firebase** → se reemplaza por Supabase. |
| **Colaboración** | `excalidraw-app/collab/Collab.tsx` (~1.100 líneas), `collab/Portal.tsx` (socket.io a `VITE_APP_WS_SERVER_URL`), `packages/excalidraw/components/live-collaboration/`, `excalidraw-app/share/` | socket.io (servidor `excalidraw-room` aparte) + Firebase para snapshots, cifrado E2E. Desactivada en Fase 1; se elimina del producto (app local, sin servidor). |
| **Lápiz / tableta** | `App.tsx`: detección `pointerType === "pen"` → `penMode`, `penDetected`; en `penMode` el toque con dedo hace pan; descarte de trazo corto con segundo dedo; `components/PenModeButton.tsx` | Base útil para rechazo de palma. No hay mapeo de botones del lápiz. |
| **Sidebar / menús** | `packages/excalidraw/components/Sidebar/*`, `DefaultSidebar.tsx`, `main-menu/*`, `excalidraw-app/components/AppSidebar.tsx`, `AppMainMenu.tsx` | La API `<Sidebar>` + `Sidebar.Tab` sirve para el árbol de carpetas sin tocar el núcleo. |
| **Servicios externos a quitar** | `excalidraw-app/sentry.ts`, `components/AI.tsx`, `ExcalidrawPlusPromoBanner.tsx`, `ExportToExcalidrawPlus.tsx`, `ExcalidrawPlusIframeExport.tsx`, analytics en `index.html`, `.env.development` / `.env.production` (traen config Firebase y URLs de excalidraw.com) | Limpieza en Fase 1. |
| **Tests** | `packages/*/tests`, `packages/excalidraw/tests`, `excalidraw-app/tests`, `vitest.config.mts`, `setupTests.ts` | Vitest + jsdom + `vitest-canvas-mock`. |

### Estrategia de código

- **Mínimos cambios en `packages/*`** (puntos de extensión pequeños: hooks de render, campo nuevo en `AppState`, mapeo de botones). Toda la lógica nueva va en `excalidraw-app/tuw/` (carpetas, Supabase, ejes, LaTeX, presets) para poder seguir mergeando `upstream`.
- **Sin tipos de elemento nuevos**: ejes, LaTeX y presets se modelan con elementos existentes (`arrow`, `text`, `image`, `freedraw`) + `customData`. Así el JSON sigue siendo compatible con Excalidraw y la exportación funciona sola.

---

## 2. Cambio de rumbo: app de escritorio local (sin cuentas ni nube)

**Decisión (2026-11-25):** The Ultimate Whiteboard es una **app de escritorio con Electron**, sin cuentas y sin servidor. Cada persona la instala desde GitHub Releases y sus datos viven en su computadora. Esto reemplaza al plan Supabase (Fase 2 anterior), que se descarta.

| Antes (Excalidraw / plan Supabase) | Ahora |
| --- | --- |
| Firebase / Supabase (Postgres, Auth, Storage, Realtime) | Carpetas y archivos reales en disco |
| Login por usuario, RLS | No hay usuarios: el sistema de archivos es el dueño |
| Colaboración en tiempo real | Fuera de alcance (Fase 11 anterior eliminada) |
| Despliegue web (Vercel) | Instaladores por GitHub Actions + Releases |
| `localStorage` / IndexedDB como única escena | Escritura en disco vía proceso principal de Electron |

**A descartar del repo (Fase 2):** `supabase/`, `excalidraw-app/tuw/supabase/`, `excalidraw-app/tuw/auth/`, dependencias `@supabase/supabase-js` y `@electric-sql/pglite`, variables `VITE_SUPABASE_*`, preguntas Q1, Q3 y Q13. **A conservar:** papelera de 15 días (ahora una carpeta oculta), hojas permitidas en la raíz, y los tests con la lógica de carpetas, que se reescriben contra el nuevo almacén.

## 3. Modelo de datos (carpetas reales en disco)

La raíz del espacio de trabajo es una carpeta que el usuario **elige en el primer arranque** (Q14).

```
The Ultimate Whiteboard/            ← espacio de trabajo
  Matemática/                       ← carpeta = directorio (anidables)
    Álgebra/
      Ecuaciones.excalidraw         ← hoja = archivo JSON de Excalidraw
  Apuntes sueltos.excalidraw        ← hoja en la raíz
  .tuw/
    workspace.json                  ← versión del formato, ajustes del espacio
    trash/                          ← papelera: trash/{timestamp}-{nombre}/ + manifest.json (ruta original)
    thumbs/                         ← miniaturas PNG (caché, se puede regenerar)
```

- **Hoja** = `.excalidraw` estándar (compatible con Excalidraw). Las extensiones propias (fondo de hoja, ejes, LaTeX, presets) viajan en `appState.tuwBackground` y en `customData.tuw` de los elementos, así el archivo sigue abriéndose en excalidraw.com (sin esos extras).
- **Imágenes**: embebidas en el propio archivo (`files` de Excalidraw, dataURL) en v1 → una hoja es un solo archivo portable. (Q17: se mantiene así.)
- **Orden**: alfabético natural por defecto; orden manual opcional en `.tuw/order.json` (por carpeta).
- **Escritura segura**: se escribe a `archivo.tmp` y se renombra (atómico); backup `.bak` de la versión anterior.
- **Detección de cambios externos** (Drive/Dropbox, otro programa): al guardar se compara `mtime`+hash de lo último leído; si cambió, se pregunta _Recargar_ / _Guardar como copia_ (reemplaza al versionado por `updated_at`).
- **Seguridad**: la interfaz NO tiene acceso a Node. Solo el proceso principal toca el disco, por IPC con rutas **relativas al espacio de trabajo**; se rechaza todo lo que salga de la raíz (`..`, rutas absolutas, enlaces simbólicos), nombres con caracteres inválidos en Windows y nombres reservados (`CON`, `NUL`…).
- **Papelera 15 días**: al iniciar la app se purga lo que tenga más de 15 días.
- **Datos locales del programa** (último espacio abierto, ventana, tema): `userData` de Electron, no en el espacio de trabajo.

## 4. Diseño de funcionalidades

### 4.1 Eje 2D y Eje 3D

- Módulo puro `excalidraw-app/tuw/axes/geometry.ts`: `axis2D({origin, lengthX, lengthY})` y `axis3D({origin, lengthX, lengthY, lengthZ, angleZDeg})` devuelven segmentos + posición de etiquetas. Ángulo Z por defecto 225° (diagonal hacia abajo a la izquierda), rango permitido 180°–270°.
- Construcción en `excalidraw-app/tuw/axes/createAxes.ts`: 2 (o 3) elementos `arrow` desde el origen + `text` para etiquetas (`x`, `y`, `z`, editables como texto normal), todos con el mismo `groupIds` → se mueven juntos ("agrupada"). Cada uno lleva `customData: { tuw: { kind: "axis", dim: 2|3, role: "x"|"y"|"z"|"label", angleZDeg } }`.
- Edición: panel en las propiedades del elemento seleccionado (cuando el grupo es un eje) con ángulo Z y largos → regenera los puntos de las flechas conservando estilo y etiquetas.
- Herramienta: dos botones en la barra ("Eje 2D", "Eje 3D"); clic en el lienzo = origen; arrastrar = tamaño.

### 4.2 Trazos tipo Impress

Presets sobre la herramienta `freedraw` existente (perfect-freehand + presión):

| Preset | Grosor | Opacidad | Presión | Extra |
| --- | --- | --- | --- | --- |
| Lápiz | fino (1–2) | 85% | variable | color gris grafito por defecto |
| Lapicera | fino (2) | 100% | constante |  |
| Fibra | medio (4–6) | 100% | constante | puntas redondas |
| Resaltador | grueso (16–24) | 40% | constante | `blendMode: "multiply"`, se dibuja detrás del texto |

- Preset guardado en `customData.tuw.stroke = { preset, blendMode }`. Presets editables y persistidos en `user_settings`.
- **Multiply**: no existe en Excalidraw. Cambio chico en `packages/element/src/renderElement.ts` (`ctx.globalCompositeOperation = "multiply"` si `customData.tuw.stroke.blendMode`) y en `renderer/staticSvgScene.ts` (`style="mix-blend-mode:multiply"`). Hay que invalidar el caché de canvas por elemento (`elementWithCanvasCache`) para que lo tome.

### 4.3 Fondos de hoja

- Tipos: `plain` (liso), `grid` (cuadriculado), `lines` (rayado), `dots` (punteado), con `color` libre, `lineColor`, `spacing`. Guardado en `sheets.background`.
- Se agrega `AppState.tuwBackground` (campo nuevo, `restore.ts` lo tolera) y una función `renderSheetBackground` en `packages/excalidraw/renderer/staticScene.ts` junto a `strokeGrid` (independiente de la grilla de _snap_ de Excalidraw).
- Export: `scene/export.ts` y `staticSvgScene.ts` dibujan el fondo si "incluir fondo" está activo.

### 4.4 Contenido

- **Ctrl+V de imágenes y arrastrar archivos**: ya existe (`App.tsx` `pasteFromClipboard`, `handleAppOnDrop`). Tarea = verificar y conectar con la subida a Storage.
- **Insertar imagen por archivo**: ya existe (herramienta `image`). **Por URL**: diálogo nuevo → `fetch` → blob → `initializeImage`. Si el servidor bloquea CORS, mensaje claro (no se usa proxy en v1; ver Q6).
- **LaTeX con KaTeX**: diálogo con input + vista previa en vivo (KaTeX HTML). Al insertar se genera un **SVG** (KaTeX HTML + CSS + fuentes embebidas dentro de `<foreignObject>`) que se guarda como elemento `image` con `customData.tuw.latex = { source, displayMode, fontSize, color }`. Doble clic → reabre el diálogo y reemplaza la imagen. Ver riesgo R6 sobre `foreignObject`.

### 4.5 Exportar hoja actual

PNG, SVG y JSON reutilizando `exportCanvas` / `serializeAsJSON`. Entrada en el menú contextual de la hoja y en el menú principal. El nombre de archivo = nombre de la hoja. JSON incluye `files` embebidos (para que sea autocontenido) y `customData` (ejes, LaTeX, presets, fondo).

### 4.6 Tabletas

- Pointer Events (ya usados). Presión desde `event.pressure` (ya se guarda en `pressures`).
- **Rechazo de palma**: si se detectó un lápiz (`penDetected`), los `pointerType === "touch"` no dibujan (pan/zoom con dos dedos sí). Se suma: ignorar contactos `touch` con `width/height` grandes mientras hay un lápiz activo, y descartar trazos `touch` que empiecen < 300 ms después de un `pen`. Toggle "Solo el lápiz dibuja".
- **Botones del lápiz**: barril → `button === 2`; goma trasera → `button === 5` / `buttons & 32`. Acciones configurables (borrador, mano/pan, selección, deshacer, cambiar preset) guardadas en `user_settings.settings.penButtons`. El mapeo físico (qué botón del lápiz manda qué) lo hace el driver de la tableta; la app solo interpreta lo que llega al navegador.
- Modelo puro `excalidraw-app/tuw/pen/penInput.ts` (decide acción a partir del evento) → testeable.

### 4.7 Menú de carpetas y hojas

- Panel en `<Sidebar>` (`excalidraw-app/tuw/explorer/`): árbol con carpetas anidadas y hojas.
- Crear, renombrar (inline), mover (arrastrar o "Mover a…"), borrar, duplicar hoja.
- Selección múltiple: Ctrl/Cmd+clic, Shift+clic (rango), y acciones en lote (mover, borrar).
- Lógica pura `excalidraw-app/tuw/explorer/tree.ts` (armar árbol desde filas planas, validar movimientos, detectar ciclos, ordenar con índice fraccional) → testeable sin Supabase.
- Se listan solo nombres y fechas (no se lee el contenido de las hojas), para que el árbol sea rápido con muchas hojas.

---

## 5. Fases

Convención: cada tarea es atómica; "Archivos" son los principales a tocar; el criterio de aceptación se verifica a mano o con test.

### Fase 1 — Base, limpieza y entorno

- [x] 1.1 Instalar Yarn 1 (`corepack enable`), `yarn install`, `yarn build:app` y `yarn test:app` en limpio; registrar el estado base (tests que ya fallan, si hay). _Acepta_: build OK y tests en verde (o lista de fallas preexistentes documentada).
- [x] 1.2 Quitar Excalidraw+, AI, Sentry y analytics. _Archivos_: `excalidraw-app/App.tsx`, `components/AppMainMenu.tsx`, `AppWelcomeScreen.tsx`, `AppSidebar.tsx`, `ExcalidrawPlus*.tsx`, `AI.tsx`, `sentry.ts`, `index.html`, `index.tsx`. _Acepta_: no aparece "Excalidraw+"/"Sign up"/AI en la UI; la pestaña Network no muestra requests a `*.excalidraw.com`, sentry ni analytics.
- [x] 1.3 Desactivar colaboración y links compartidos detrás de `VITE_TUW_ENABLE_COLLAB=false`. _Archivos_: `excalidraw-app/App.tsx`, `collab/*`, `share/*`, `data/index.ts`. _Acepta_: no hay botón "Live collaboration"/"Share"; no se abren websockets.
- [x] 1.4 Variables de entorno: `.env.example` (Supabase URL/anon key, flags), `.env.local` en `.gitignore`; quitar config Firebase y URLs de excalidraw.com de `.env.development`/`.env.production`. _Acepta_: `git grep -n "firebaseapp\|excalidraw.com" -- .env*` vacío; app arranca con `.env.local`.
- [x] 1.5 Rebranding restante: strings i18n en `es-ES` y `en` (`packages/excalidraw/locales/`), favicon/íconos (`public/`), título del menú, `og-image`. _Acepta_: no se ve "Excalidraw" en la UI salvo en "Acerca de / créditos".
- [x] 1.6 Pantalla "Acerca de" con créditos a Excalidraw y licencia MIT. _Acepta_: accesible desde el menú principal.

**Notas de la Fase 1 (hecho):**

- Colaboración: flag `VITE_TUW_ENABLE_COLLAB` (por defecto `false`; `true` en `.env.test` para los tests heredados). El código de `collab/` y `data/firebase.ts` sigue en el repo, sin montar, hasta reemplazarlo (Fase 3 / 11).
- Se eliminaron: Excalidraw+, AI/TTD trigger, Sentry (+ `@sentry/browser`, `callsites`), analytics, sitemap, links compartidos (`#json=`, `?id=`, salas), diálogo Share, promos del sidebar, comandos a GitHub/X/Discord/YouTube.
- Verificado en el navegador: 0 hosts externos al cargar (solo `localhost`).
- Logo elegido: **opción 5 (cuaderno cuadriculado)**, en `branding/logo.svg`; íconos PWA/ICO regenerados y `og-image`/screenshots de Excalidraw eliminados. Los demás idiomas de `locales/*.json` conservan "Excalidraw".
- La librería pública de Excalidraw (`VITE_APP_LIBRARY_*`) se mantiene: solo hace requests si hacés clic en "Explorar librerías"/"Publicar".

### Fase 2 — Limpieza de Supabase y cáscara Electron

- [x] 2.1 Borrar `supabase/`, `tuw/supabase/`, `tuw/auth/`, `AuthGate` y el ítem "Cerrar sesión"; quitar `@supabase/supabase-js`, `@electric-sql/pglite` y `VITE_SUPABASE_*` de `.env.example`/typings. _Acepta_: `git grep -i supabase` solo en `PLAN.md`; build y tests en verde.
- [x] 2.2 Paquete `desktop/` (Electron): `main.ts` (ventana, menú, instancia única), `preload.ts` (puente IPC mínimo, `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`), CSP estricta, bloqueo de navegación y de `window.open` externos. _Acepta_: `yarn desktop:dev` abre una ventana con la app; la consola de la ventana no puede hacer `require`.
- [x] 2.3 Scripts `desktop:dev` (Vite + Electron) y `desktop:build` (app web empaquetada con rutas relativas). _Acepta_: `yarn desktop:build` genera una app ejecutable sin servidor.
- [x] 2.4 Ícono de la app a partir del logo 5 (`.ico`/`.png`) y nombre "The Ultimate Whiteboard".
- [x] 2.5 Idioma por defecto `es-ES` (Q8): cambiar el detector de idioma (`excalidraw-app/app-language/language-detector.ts`); el selector de idioma se mantiene. _Acepta_: en una instalación limpia la interfaz arranca en español.

**Notas de la Fase 2 (hecho):**

- 2.1: se borraron `supabase/`, `tuw/supabase/`, `tuw/auth/` y la dependencia; `git grep -i supabase` solo aparece en `PLAN.md`.
- 2.2/2.3: paquete `desktop/` (workspace). `src/main.ts`, `src/preload.ts`, `src/api.ts` (lista cerrada de operaciones, hoy solo `getAppInfo`), `src/security.ts` (lógica pura y testeada). La app empaquetada se sirve con un esquema propio `tuw://app/` (no `file://`) con CSP estricta: scripts por hash, sin `unsafe-eval`, sin red externa. `contextIsolation`, sandbox, sin `nodeIntegration`, navegación y `window.open` bloqueados, permisos denegados salvo portapapeles.
- Scripts: `yarn desktop:dev`, `desktop:build`, `desktop:start`; `yarn test:typecheck` ahora revisa también `desktop/` (tsconfig aparte para que los tipos de Electron no afecten a los tests de la interfaz).
- Verificación real con Electron 45.5.0: el autotest (`TUW_SELFTEST=1`) confirma que la ventana no tiene `require`/`process`/`ipcRenderer`, solo `window.tuw.getAppInfo`, interfaz en `es-ES`, 0 hosts externos y 0 errores de consola (en modo compilado y en `desktop:dev`).
- Hallazgos corregidos: (1) en producción Excalidraw pedía las **fuentes a su CDN** y a `esm.sh` (`scripts/woff2/woff2-vite-plugins.js`, `ExcalidrawFontFace.ts`): ahora se sirven locales, así funciona offline. La verificación de "0 hosts externos" de la Fase 1 solo cubría el modo dev. (2) En Node `new URL("tuw://app").origin` es `"null"`: el chequeo de navegación se reescribió comparando esquema y host. (3) Faltaba el `Content-Type` correcto (fuentes/wasm) en el servidor propio.
- 2.4: ícono del logo 5 en `desktop/build/icon.ico` (7 tamaños) y `icon.png`.
- 2.5: idioma por defecto `es-ES`, respetando la elección guardada del usuario (los tests heredados siguen en inglés).
- Pendiente: el instalador (`.exe`) llega en la Fase 11; hoy la app corre con `yarn desktop:dev/start`. No se probó el arranque en una PC limpia.

### Fase 3 — Espacio de trabajo en disco (almacén de archivos)

- [x] 3.1 `desktop/workspace/paths.ts`: resolución segura de rutas, validación de nombres (Windows), anti-traversal + tests.
- [x] 3.2 `desktop/workspace/store.ts`: listar árbol, crear/renombrar/mover/borrar carpetas y hojas, leer/escribir hoja con escritura atómica y `.bak` + tests sobre un directorio temporal.
- [x] 3.3 Papelera: `trash/` con manifest, restaurar a la ruta original (o raíz si ya no existe), purga > 15 días + tests con fechas simuladas.
- [x] 3.4 Detección de cambios externos (mtime+hash) y resolución de conflictos + tests.
- [x] 3.5 API IPC tipada (`window.tuw.workspace.*`) y elección de la carpeta del espacio de trabajo en el **primer arranque** (Q14; se recuerda en `userData`, y se puede cambiar desde ajustes).
- [x] 3.6 Integrar con el editor: abrir hoja = cargar escena; autosave con debounce; flush al cerrar la ventana; reemplaza `LocalData`. _Archivos_: `excalidraw-app/App.tsx`, `data/LocalData.ts`, `data/FileManager.ts`, `tuw/scene/serialize.ts`. _Acepta_: dibujar, cerrar la app, reabrir → todo está; el archivo se abre en excalidraw.com; tests de serialización (ida y vuelta, `customData` intacto).

**Notas de la Fase 3 (hecho):**

- **Almacén** (`desktop/src/workspace/`): `paths.ts` (nombres y rutas seguros), `store.ts` (árbol, carpetas, hojas, escritura atómica con `.tmp`+rename, backup en `.tuw/bak` como máximo cada 5 min, papelera `.tuw/trash` con manifiesto y purga a los 15 días, detección de cambios externos por mtime+tamaño+hash), `result.ts` (errores como datos y validación de argumentos IPC), `types.ts` (tipos compartidos con la interfaz). Se rechaza `..`, rutas absolutas, `\`, la carpeta `.tuw`, nombres reservados de Windows y enlaces simbólicos que salgan de la raíz.
- **IPC** (`api.ts`, `preload.ts`, `workspaceService.ts`): lista cerrada de operaciones en `window.tuw.workspace.*`, cada una valida el origen del mensaje y los argumentos. Ajustes del programa (última carpeta y hoja) en `userData/settings.json`.
- **Primer arranque**: diálogo "Elegir carpeta… / Usar Documentos" (Q14). Si se elige una carpeta con archivos ajenos se crea la subcarpeta "The Ultimate Whiteboard" para no mezclar.
- **Editor** (`excalidraw-app/tuw/workspace/`): `SheetSession` (autosave con retraso de 1,5 s, una escritura a la vez, no reescribe si nada cambió, flush al cerrar la ventana o al perder el foco), `startup.ts` (abre la última hoja, o la primera válida, o crea "Hoja 1"; una hoja dañada nunca se sobrescribe), `sceneFile.ts` (formato `.excalidraw` estándar con imágenes embebidas). En `App.tsx` el guardado local anterior solo se usa fuera de Electron.
- **Cambio respecto al plan (conflictos)**: en vez de preguntar "Recargar / Guardar como copia", si el archivo cambió afuera tu versión se guarda **automáticamente** en "Nombre (copia de conflicto)" y se avisa con un aviso en pantalla. Así no hay diálogo ni pérdida de datos.
- **Verificación real en Electron** (selftest con carpetas temporales): dibujar un rectángulo con eventos de mouse reales → se guarda en `Hoja 1.excalidraw`; reiniciar → el rectángulo reaparece y el archivo NO se reescribe; cerrar la ventana 250 ms después de dibujar (antes del autosave) → igual queda guardado.
- **No probado a mano**: los diálogos nativos de elegir carpeta (primer arranque y "cambiar carpeta"), y el aviso visual del conflicto dentro de la app (sí está probado el flujo con disco real en `integration.test.ts`).
- **Todavía no hay interfaz para**: cambiar de hoja, crear/renombrar/borrar carpetas y hojas ni ver la papelera. Eso es la Fase 4; la API ya existe.

### Fase 4 — Explorador de carpetas y hojas

- [x] 4.1 `tuw/explorer/tree.ts` (árbol desde filas planas, validación de movimientos, orden) + tests.
- [x] 4.2 Panel en `<Sidebar>`: árbol, expandir/colapsar, hoja activa resaltada.
- [x] 4.3 Crear / renombrar / borrar (a papelera) carpeta y hoja; vista de papelera con restaurar.
- [x] 4.4 Mover por arrastrar y por "Mover a…".
- [x] 4.5 Selección múltiple (Ctrl/Shift) y acciones en lote.
- [x] 4.6 Duplicar hoja. (Miniaturas: pospuestas, ver notas.) _Acepta (fase)_: con 300 hojas en 30 carpetas el árbol abre en < 1 s; no se puede mover una carpeta dentro de sí misma; los cambios persisten tras reiniciar.

**Notas de la Fase 4 (hecho):**

- **Lógica pura** (`excalidraw-app/tuw/explorer/tree.ts`): aplanado del árbol, búsqueda sin tildes ni mayúsculas, selección múltiple (clic, Ctrl, Shift, Ctrl+Shift), `validateMove` (rechaza carpeta dentro de sí misma o de un descendiente, ignora lo que ya está en el destino), destinos válidos para "Mover a…".
- **Controlador** (`controller.ts`): abrir (guarda antes lo pendiente), crear, renombrar, mover, borrar (papelera 15 días), duplicar, restaurar. Probado contra el disco real: renombrar o mover la hoja abierta (o su carpeta) hace que la sesión la siga; borrar la hoja abierta abre otra (o crea "Hoja 1") y **nunca la vuelve a escribir** en la ruta vieja; un cambio del editor durante un movimiento se guarda en la ruta nueva.
- **Panel** (`SheetExplorer.tsx`, pestaña "Hojas" del panel lateral, y menú ☰ → "Hojas y carpetas"): árbol con la hoja activa resaltada, búsqueda, crear hoja/carpeta con renombrado en el lugar, F2, Supr, Enter, flechas, Ctrl+A, menú contextual (clic derecho), arrastrar y soltar (incluye varias a la vez y soltar en el fondo = raíz), diálogo "Mover a…", papelera con restaurar / eliminar definitivamente / vaciar, y "Cambiar carpeta…" en el pie.
- **Bugs encontrados y corregidos por las pruebas**: (1) al cambiar de hoja se aplicaba el `appState` completo y **se cerraba el panel lateral**: ahora solo se aplican las claves persistentes; (2) el campo de renombrar podía confirmar dos veces (Enter + perder el foco); (3) el panel se desbordaba del alto de la ventana por los contenedores flex de Excalidraw.
- **Verificación real en Electron** (`yarn desktop:build` y `yarn desktop:selftest`): espacio de trabajo temporal de 300 hojas en 30 carpetas. El panel abre en ~70 ms (límite 1000 ms) y dibuja las 330 filas en ~12 ms; crear carpeta, abrir hoja, selección múltiple, arrastrar 3 hojas a otra carpeta, bloqueo de carpeta dentro de sí misma, hoja a la raíz, borrar con Supr + confirmación, restaurar desde la papelera y renombrar con F2 funcionan, y el disco queda exactamente como lo muestra el panel.
- **Pospuesto**: las miniaturas de las hojas (requieren generar y mover imágenes en `.tuw/thumbs` junto con cada renombrado/movimiento). No estaban en tu lista original; se retoman si las querés.
- **No probado a mano**: arrastrar con el mouse real (el guion envía los mismos eventos que el navegador, pero no el gesto físico), el menú contextual con clic derecho real y el diálogo "Mover a…" (están programados y tipados, pero el guion no los abre).

### Fase 5 — Fondos de hoja

- [x] 5.1 Tipo `SheetBackground` + `AppState.tuwBackground` + `restore` tolerante (`packages/excalidraw/types.ts`, `appState.ts`, `data/restore.ts`).
- [x] 5.2 `renderSheetBackground` (liso, cuadriculado, rayado, punteado) en `renderer/staticScene.ts`; acompaña zoom/scroll.
- [x] 5.3 Selector de fondo (tipo, color libre, color de línea, espaciado), guardado dentro de la hoja, más un **fondo por defecto** para hojas nuevas (Q9).
- [x] 5.4 Fondos en export PNG/SVG. _Acepta_: cada tipo se ve igual en pantalla y en el export; persiste por hoja; 60 fps con zoom/pan.

**Notas de la Fase 5 (hecho):**

- **Modelo** (`packages/excalidraw/scene/sheetBackground.ts`): `AppState.tuwBackground = { type: plain|grid|lines|dots, lineColor: #hex | null (automático), spacing: 8–120 }`. El color de fondo libre sigue siendo `viewBackgroundColor`. Se guarda en el archivo de la hoja (`appState`), así cada hoja tiene el suyo; un archivo sin fondo, viejo o dañado se abre liso (`normalizeSheetBackground`).
- **Una sola fuente de verdad** para pantalla, PNG y SVG. El color automático se adapta al fondo (oscuro sobre claro, claro sobre oscuro, y modo oscuro). El PNG y el SVG con fondo transparente no llevan patrón.
- **Selector**: menú ☰ → "Fondo de la hoja…" (miniaturas, 8 colores + otro, color de líneas, separación) y "Usar para las hojas nuevas" / "Restablecer" (Q9; se guarda en el programa, no en las hojas). Una hoja nueva recibe ese fondo y se guarda en su archivo; abrir una hoja existente no lo cambia.
- **Verificado en el navegador**: pantalla, PNG y SVG coinciden píxel a píxel (diferencia media 0; puntos del SVG 0,12 sobre 255) con rayado, cuadrícula con color propio y puntos.
- **Rendimiento**: dibujar el patrón directo costaba hasta ~15 ms por cuadro con puntos; un patrón relleno resultó más lento (render por software). Solución: capa en caché que se desplaza con un offset entero cuando la vista está estable (solo en pantalla; la exportación dibuja directo). Resultado a 1920×1080 (1× y 2×): 0,2–2 ms por cuadro. Durante un zoom continuo cada cuadro se dibuja directo, como antes. El patrón se mueve rígido, con diferencias de ≤1 px respecto del trazo directo.
- **En Electron** (`desktop/selftest/background.e2e.js`): elegir cuadriculado + color crema → queda en `Hoja 1.excalidraw` y vuelve igual al reabrir.
- **Tests**: 34 nuevos (`packages/excalidraw/tests/sheetBackground.test.ts`) + defaults y controlador. Los snapshots existentes cambiaron solo por la clave nueva `tuwBackground`.
- **No medido**: fps reales con GPU (el navegador de pruebas frena `requestAnimationFrame` y renderiza por software); tema oscuro mirado a ojo en pantalla.

### Fase 6 — Trazos tipo Impress

- [x] 6.1 Presets (`tuw/strokes/presets.ts`) + tests.
- [x] 6.2 Selector de presets al elegir freedraw (grosor/opacidad/presión/color).
- [x] 6.3 Modo multiply en render canvas + SVG (`renderElement.ts`, `staticSvgScene.ts`).
- [x] 6.4 Presets propios guardados en los ajustes locales de la app. _Acepta_: el resaltador sobre texto negro lo deja legible (multiply) en pantalla y en el export.

**Notas de la Fase 6 (hecho):**

- **Presets** (`excalidraw-app/tuw/strokes/presets.ts`): Lápiz (grafito, fino, 85 %, presión variable), Lapicera (negro, 1, constante), Fibra (negro, grueso, constante) y Resaltador (amarillo, 9, 40 %, **multiply**). Cada preset fija color, opacidad, presión, grosor y modo de mezcla.
- **Estado**: `AppState.tuwStroke = { preset, strokeWidth, blendMode }` (no se guarda en la hoja). Al crear un trazo libre se usa ese grosor y el trazo queda marcado con `customData.tuw.stroke = { preset, blendMode }`; así cada trazo recuerda su modo aunque cambies de preset.
- **Multiply** (`packages/element/src/tuwStroke.ts`, `renderElement.ts`, `staticSvgScene.ts`): en el lienzo se aplica `globalCompositeOperation = "multiply"` al copiar el trazo, en la exportación PNG igual, y en el SVG con `mix-blend-mode: multiply`. No hace falta invalidar la caché del trazo porque la mezcla se aplica al copiarlo.
- **Barra de presets** (`StrokePresetBar.tsx`): aparece al elegir el lápiz (tecla P) con las miniaturas de cada trazo, "Guardar" (preset propio con lo activo, hasta 12, nombres únicos sin distinguir mayúsculas), × para eliminar los propios y "Sin preset". Los propios se guardan en el programa (localStorage).
- **Verificado en el navegador**: banda negra con la lapicera + resaltador encima. Sobre el negro queda `30,28,21` (legible) y sobre blanco `255,238,177` (amarillo), igual en pantalla, PNG y SVG (±1). En Electron: dibujar con lapicera y resaltador → el archivo guarda grosor, opacidad y `blendMode` de cada trazo.
- **Tests**: 13 de presets + 7 de estado/exportación SVG/archivo. Los snapshots existentes cambiaron solo por la clave nueva `tuwStroke`.
- **Límites conocidos**: si cambiás el grosor en el panel de propiedades con un preset activo, el grosor del preset manda hasta pulsar "Sin preset" (aviso pendiente). En modo oscuro el multiply sobre fondo oscuro se nota poco. La barra no está pensada para pantallas muy angostas. No probé con una tableta real (presión del lápiz físico): eso es la Fase 9.

### Fase 7 — Ejes 2D y 3D

- [ ] 7.1 `tuw/axes/geometry.ts` + tests (puntos, ángulos límite, etiquetas, origen arbitrario).
- [ ] 7.2 `createAxes.ts` (flechas + textos agrupados con `customData`).
- [ ] 7.3 Herramientas "Eje 2D" / "Eje 3D" (clic = origen, arrastre = tamaño).
- [ ] 7.4 Panel de propiedades: ángulo Z, largos; etiquetas editables. _Acepta_: el eje se mueve/escala como grupo; cambiar el ángulo actualiza la diagonal; sobrevive a guardar/recargar y exportar.

### Fase 8 — Contenido: imágenes por URL y LaTeX

- [ ] 8.1 Verificar Ctrl+V y arrastrar archivos de imagen (ya existen en el editor).
- [ ] 8.2 Diálogo "Insertar imagen desde URL" (la descarga la hace el proceso principal: sin límite de CORS).
- [ ] 8.3 Dependencia `katex`; diálogo LaTeX con vista previa en vivo.
- [ ] 8.4 Render a SVG (`tuw/latex/renderToSvg.ts`), inserción como imagen con `customData.tuw.latex`, doble clic para editar. _Acepta_: `\int_0^1 x^2\,dx` se inserta, se edita y se exporta bien; tests del armado del SVG.

### Fase 9 — Tabletas y lápiz

- [ ] 9.1 `tuw/pen/penInput.ts` (clasificar evento → acción) + tests.
- [ ] 9.2 Rechazo de palma reforzado y toggle "Solo el lápiz dibuja" (`packages/excalidraw/components/App.tsx`, enganche mínimo).
- [ ] 9.3 Botones del lápiz configurables (UI de ajustes; guardado local). _Acepta_: con tableta Wacom/XP-Pen: la presión cambia el grosor; apoyar la palma no dibuja; el botón de barril ejecuta la acción elegida.

### Fase 10 — Exportación de hoja

- [ ] 10.1 "Exportar hoja" en menú y menú contextual: PNG, SVG, JSON (diálogo nativo de guardado).
- [ ] 10.2 Incluir fondo, multiply, LaTeX y nombre de hoja; JSON autocontenido. _Acepta_: el JSON exportado se reimporta (en TUW y en excalidraw.com) sin pérdida visible.

### Fase 11 — Instaladores y publicación en GitHub

- [ ] 11.1 `electron-builder`: solo Windows (NSIS `.exe`, Q15).
- [ ] 11.2 GitHub Actions (runner Windows): al crear un tag `v*` compila y publica el instalador y `latest.yml` en Releases.
- [ ] 11.3 README de instalación y de desarrollo (`yarn install`, `yarn desktop:dev`), `CHANGELOG`, licencia MIT + créditos a Excalidraw dentro de la app instalada.
- [ ] 11.4 Auto-actualización con `electron-updater` desde GitHub Releases (Q16): comprobar al iniciar, descargar en segundo plano y aplicar al reiniciar; botón "Buscar actualizaciones". Requiere repo público.
- [ ] 11.5 Revisión final: sin secretos ni rutas personales en el repo; `LICENSE` original intacto. _Acepta_: instalar el `.exe` en una PC limpia, abrir, crear una hoja y que persista tras reiniciar.

## 6. Riesgos técnicos

| # | Riesgo | Mitigación |
| --- | --- | --- |
| R1 | **Rendimiento con muchas hojas**: listar y leer cientos de archivos. | El árbol se arma solo con nombres/`mtime` (sin leer el contenido); miniaturas en caché; virtualizar el árbol si supera ~1.000 nodos. |
| R2 | **Hojas grandes** (muchos trazos freedraw; imágenes en base64 → JSON de decenas de MB). | Autosave con debounce; escribir solo si cambió; aviso por tamaño; opción de `.assets` externa (Q17). |
| R3 | **Seguridad de Electron**: un fallo en la interfaz con acceso a Node sería grave. | `contextIsolation`, sin `nodeIntegration`, sandbox, CSP, IPC con lista cerrada de operaciones y rutas relativas validadas; no cargar contenido remoto. |
| R4 | **Instaladores sin firmar**: Windows SmartScreen muestra advertencia en la primera instalación. | Documentarlo en el README; firmar requiere certificado de pago (opcional). La auto-actualización funciona igual sin firma. |
| R5 | **Datos corruptos o perdidos** (corte de luz, antivirus, carpeta en OneDrive). | Escritura atómica + `.bak`; papelera de 15 días; detección de cambios externos. |
| R6 | **Rutas y nombres en Windows** (caracteres inválidos, nombres reservados, longitud, mayúsculas). | Validación centralizada en `paths.ts` con tests. |
| R7 | **Mergear con upstream**: `App.tsx` cambia mucho. | Cambios en `packages/*` mínimos y marcados `// TUW:`; lógica nueva en `excalidraw-app/tuw/` y `desktop/`. |
| R8 | **KaTeX no genera SVG nativo** (`foreignObject`, fuentes embebidas). | Spike temprano en Fase 8; alternativa MathJax con salida SVG (Q5). |
| R9 | **Botones del lápiz dependen del driver/SO**: el barril suele llegar como clic derecho. | Configurable + modo "detectar botón" que muestra qué evento llega. |
| R10 | **Peso de la app** (~100 MB por Electron) | Aceptado (solo Windows). |
| R11 | **Repo público obligatorio para auto-actualizar** (si no, habría que embeber un token). | Repo público; nunca poner tokens en la app ni en el repo. |

---

## 7. Decisiones y preguntas

**Todas las preguntas están respondidas (2026-11-25):**

| # | Tema | Decisión |
| --- | --- | --- |
| Q1 | Borrar carpeta | Papelera de **15 días** |
| Q3 | Cuentas | **Sin cuentas ni servidor**: app de escritorio (Electron) |
| Q4 | Hojas en la raíz | **Permitidas** |
| Q5 | LaTeX | **KaTeX** |
| Q8 | Idioma | **Español por defecto** + inglés (y los demás que trae Excalidraw) |
| Q9 | Fondo | **Por hoja + valor por defecto** para hojas nuevas (ajuste) |
| Q10 | Tamaño de hoja | **Lienzo infinito** |
| Q11 | Repo | `https://github.com/dapagella/The-Ultimate-Whiteboard` (ya creado; agregado como remoto `origin`, **sin subir nada**) |
| Q14 | Ubicación de los datos | **Se elige en el primer arranque** |
| Q15 | Sistemas operativos | **Solo Windows** (instalador `.exe`) |
| Q16 | Actualizaciones | **Auto-actualización** con `electron-updater` desde GitHub Releases |
| Q17 | Imágenes | **Dentro del archivo** de la hoja |

Consecuencia de Q16: `electron-updater` lee los Releases sin credenciales solo si el **repo es público**. Un repo privado exigiría guardar un token dentro de la app, lo cual no se hace (R11).
