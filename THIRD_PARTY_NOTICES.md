# Third-party notices

The project's MIT license applies to original source code and documentation artwork only. Bundled dependencies and model assets retain their original licenses.

| Component | Source | License |
| --- | --- | --- |
| PaddleOCR.js SDK 0.4.2 | [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR/tree/main/paddleocr-js) | Apache-2.0 |
| Official PP-OCRv5 model archives | [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR) / official Paddle model host | Distributed by PaddleOCR under its project licensing; see upstream model documentation |
| ONNX Runtime Web 1.29.0 | [Microsoft ONNX Runtime](https://github.com/microsoft/onnxruntime) | MIT |
| OpenCV.js 4.10.0 and npm wrapper | [OpenCV](https://github.com/opencv/opencv), [TechStark wrapper](https://github.com/TechStark/opencv-js) | Apache-2.0 for OpenCV 4.10; wrapper Apache-2.0 |
| OpenCC-js 1.4.2 | [nk2028/opencc-js](https://github.com/nk2028/opencc-js) | MIT AND Apache-2.0; bundled dictionaries retain upstream notices |
| js-yaml | [nodeca/js-yaml](https://github.com/nodeca/js-yaml) | MIT |
| clipper-lib | [junmer/clipper-lib](https://github.com/junmer/clipper-lib) | BSL-1.0 |

Build tools such as TypeScript and esbuild have their own licenses and are not part of the extension runtime.

## OpenCV build adaptation

`scripts/opencv-csp.mjs` adapts the JavaScript glue in the pinned OpenCV npm package during bundling. It replaces four dynamically constructed binding wrappers with closure-based implementations and skips network fetching for embedded WASM data. This preserves Manifest V3's CSP without JavaScript `unsafe-eval`. The transformation is checked against the pinned upstream layout and fails if it no longer matches.

The adapted OpenCV code is derived from upstream OpenCV/Emscripten glue and retains upstream licensing. No upstream dependency files are modified in place.

## Distribution

The build copies available dependency LICENSE, NOTICE and COPYING files into `dist/licenses`, and includes this document plus the project LICENSE. The upstream PaddleOCR Apache-2.0 text is included in `docs/licenses` and copied into the distributable.

All README banners, flow diagrams and the synthetic video fixture artwork were created for this project. The UI screenshots show this project's extension; no subtitle.im artwork or extension assets are redistributed.
