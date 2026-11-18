# Voyager 1 · One Light-Day AR

A WebXR AR companion for a 3D-printed Voyager 1 model (about 1:38.7 scale). Line the overlay up with your print once, then tap the blinking buttons to hear about each part. Switch to **Space** mode to swap your room for interstellar space at Voyager's speed.

**Live:** https://hugoboss117.github.io/voyager-ar/ (Chrome on Android with ARCore → ⋮ → *Install app*)

## Use
1. Put the print on a table in good light. Open the app and tap **Start AR**.
2. Point at the table and tap where the model stands. A ghost model appears.
3. Drag with one finger to slide it. Twist with two fingers to rotate and pinch to fine-tune the scale. The ⟲/⟳ buttons rotate it 1°. Tap **Lock** when it matches.
4. Tap a blinking button: green means the part still works, grey means it's retired, gold means info.
5. **🚀 Space** replaces the camera view with a starfield and streaming dust. **Real size** grows the model to 1:1 (a 13 m magnetometer boom).

## Layout
- `docs/`: the deployed site (GitHub Pages serves this folder)
  - `assets/voyager.glb`: assembled and colored model (metres, Y-up, origin = table point under the bus)
  - `audio/NN_name.mp3`: narration files, one per button
- `src/`: app source. `data.js` holds button text, status, positions (mm on the print) and audio paths.
- `tools/`: Python scripts that assembled the print-bed STLs (`assemble.py`) and exported the GLB (`export_glb.py`)

## Build
```
npm i three three-mesh-bvh esbuild
npx esbuild src/main.js --bundle --format=esm --minify --outfile=docs/app.js
```

## Notes
- Dust flows toward the dish. The high-gain antenna points at Earth, so Voyager is flying the other way. To reverse it, flip `FLOW` in `main.js`.
- Facts current to Nov 18, 2026. Working instruments: MAG and PWS. LECP was switched off on Apr 17, 2026.
