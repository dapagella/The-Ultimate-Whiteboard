# The Ultimate Whiteboard

Pizarra digital personal basada en [Excalidraw](https://github.com/excalidraw/excalidraw). Funciona **como una app de Windows**: sin cuentas, sin servidores y sin internet. Tus dibujos son archivos normales en una carpeta de tu computadora.

## Qué tiene

- **Carpetas y hojas** guardadas como archivos reales en la carpeta que elijas al abrir la app por primera vez (panel "Hojas y carpetas": crear, renombrar, mover, duplicar, papelera de 15 días). Se guardan solas.
- **Trazos** tipo lápiz, fibra y resaltador (el resaltador no tapa lo de abajo).
- **Fondos de hoja**: liso, cuadriculado, rayado o punteado, con color propio por hoja.
- **Ejes 2D y 3D** listos para pegar y editar (ángulo y largo de cada eje).
- **Imágenes**: pegar con `Ctrl+V` (un recorte de pantalla, por ejemplo), arrastrar archivos o insertar desde una dirección web.
- **Fórmulas matemáticas** en LaTeX (KaTeX), con vista previa; doble clic para editarlas.
- **Tabletas y lápiz**: presión, rechazo de palma, "solo el lápiz dibuja" y botón del lápiz configurable.
- **Exportar** una hoja a PNG, SVG o `.excalidraw`.
- **Actualizaciones automáticas** desde esta página de GitHub.

## Instalar (Windows 10/11, 64 bits)

1. Entrá a [**Releases**](https://github.com/dapagella/The-Ultimate-Whiteboard/releases/latest) y descargá `TheUltimateWhiteboard-Setup-<versión>.exe`.
2. Ejecutalo. Se instala solo para tu usuario (no pide permisos de administrador) y podés elegir la carpeta.
3. La primera vez que abrís la app te pide elegir la carpeta donde se guardan tus hojas.

> **Aviso de Windows ("Windows protegió su PC")**: el instalador **no está firmado digitalmente** (la firma requiere un certificado de pago). Es normal que SmartScreen lo advierta la primera vez: tocá **Más información → Ejecutar de todas formas**. El código fuente completo está en este repositorio.

Al desinstalar **no se borran tus dibujos**: están en tu carpeta de trabajo.

La app busca versiones nuevas al abrirse, las descarga en segundo plano y las instala al cerrar. También podés usar **☰ → Acerca de → Buscar actualizaciones**.

## Desarrollo

Requisitos: Node >= 22 y Yarn 1 (`corepack enable` o `npm i -g yarn`).

```bash
yarn install
yarn desktop:dev      # app de escritorio (Electron) con recarga en vivo
yarn desktop:build    # compila la app de escritorio en desktop/dist
yarn desktop:start    # abre lo compilado
yarn desktop:pack     # crea el instalador de Windows en desktop/release (sin publicar)
yarn start            # solo la interfaz web, en http://localhost:3001
yarn test:app         # tests
yarn test:typecheck   # TypeScript (interfaz + escritorio)
yarn test:code        # lint
```

Si `yarn install` no descargó el binario de Electron, ejecutá `node node_modules/electron/install.js`.

Pruebas de punta a punta en la app real (después de `yarn desktop:build`):

```bash
yarn desktop:selftest                        # explorador de hojas
node desktop/scripts/selftest-run.mjs pen    # lápiz (también: export)
node desktop/scripts/selftest-content.mjs    # imagen por URL y fórmulas
node desktop/scripts/selftest-paste.mjs      # Ctrl+V de una imagen
node desktop/scripts/selftest-persist.mjs    # persistencia al cerrar y reabrir
```

### Publicar una versión

1. Subí la versión en `desktop/package.json` y anotá los cambios en `CHANGELOG.md`.
2. `git tag v<versión>` y `git push origin v<versión>`.
3. GitHub Actions (`.github/workflows/release.yml`) compila el instalador y lo publica en _Releases_ con `latest.yml` (lo que usa la auto-actualización). No hace falta ningún secreto: usa el token temporal que GitHub da a cada ejecución.

La auto-actualización necesita que este repositorio sea **público** (lee los Releases sin credenciales). Nunca pongas tokens dentro de la app ni del repositorio.

## Estructura

- `desktop/` — app de escritorio (Electron): proceso principal, almacén de hojas, seguridad, instalador.
- `excalidraw-app/tuw/` — interfaz propia (explorador, fondos, trazos, ejes, fórmulas, lápiz, exportar).
- `packages/` — el editor (Excalidraw); los cambios propios están marcados y son mínimos.
- `PLAN.md` — plan, decisiones y estado de cada fase.

## Créditos y licencia

Este proyecto es un fork de **Excalidraw** — © 2020 Excalidraw y sus colaboradores — distribuido bajo la [licencia MIT](LICENSE). El archivo `LICENSE` original se conserva sin cambios. El README original de Excalidraw está en [docs/EXCALIDRAW_README.md](docs/EXCALIDRAW_README.md). Otros componentes: ver [branding/THIRD_PARTY_NOTICES.md](branding/THIRD_PARTY_NOTICES.md).

Los cambios propios de The Ultimate Whiteboard también se publican bajo MIT. Este proyecto no está afiliado ni respaldado por Excalidraw.
