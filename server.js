// const express = require("express");
// const path = require("path");

// const app = express();
// const PORT = process.env.PORT || 3000;

// app.set("view engine", "ejs");
// app.set("views", path.join(__dirname, "views"));

// app.use(express.static(path.join(__dirname, "public")));
// app.use(express.urlencoded({ extended: true }));

// const MODE_CONFIGS = {
//   mist: {
//     title: "Mist & Vapor Dispersion",
//     badge: "OPTICAL FLOW + BLOOM",
//     description:
//       "Accumulates temporal frame deltas with Gaussian diffusion to mimic illuminated mist clouds, highlighting air currents and particle clustering.",
//     tip: "Point near a window shaft of light or lamp for best Tyndall scattering.",
//   },
//   raw_particulate: {
//     title: "High-Contrast Particulate Isolate",
//     badge: "CLAHE + DELTA THRESHOLD",
//     description:
//       "Strips static background geometry using frame differencing and amplifies micro-specks in high-contrast cyan.",
//     tip: "Hold the phone steady against a dark background to isolate floating dust.",
//   },
//   density_heatmap: {
//     title: "Cluster Density Field",
//     badge: "COLORMAP_JET / INFERNO",
//     description:
//       "Maps spatial concentration of airborne movement into thermal density zones to reveal stagnant pockets vs. active drafts.",
//     tip: "Wave a hand or blow gently across the frame to watch dispersion gradients.",
//   },
// };

// app.get("/", (req, res) => {
//   res.render("index", {
//     initialMode: MODE_CONFIGS.mist,
//   });
// });

// // HTMX endpoint to dynamically update HUD mode metadata
// app.get("/hud/mode/:mode", (req, res) => {
//   const modeKey = req.params.mode;
//   const config = MODE_CONFIGS[modeKey] || MODE_CONFIGS.mist;
//   res.render("partials/mode-info", { mode: config });
// });

// app.listen(PORT, () => {
//   console.log(`Particulate Sensor server running on port ${PORT}`);
// });

const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));

const MODE_CONFIGS = {
  mist: {
    title: "Mist & Vapor Dispersion",
    badge: "TEMPORAL BLOOM",
    description:
      "Accumulates frame-to-frame motion with Gaussian blur to visualize air currents and vapor-like dispersion trails.",
    tip: "Angled light (a lamp or window) makes fine particles easier for the sensor to catch.",
  },
  raw_particulate: {
    title: "High-Visibility Orange Isolate",
    badge: "TOPHAT + DELTA",
    description:
      "Uses a morphological top-hat filter to reject wide room surfaces and highlights isolated specks in bright orange.",
    tip: "Works against light or dark walls; raise Sensitivity if specks are very faint.",
  },
  density_heatmap: {
    title: "Cluster Density Field",
    badge: "COLORMAP_INFERNO",
    description:
      "Maps spatial concentration of movement into a thermal field to spot clustering pockets and active drafts.",
    tip: "Move air gently with your hand or a fan to observe dispersion spread.",
  },
};

app.get("/", (req, res) => {
  res.render("index", {
    initialMode: MODE_CONFIGS.raw_particulate,
  });
});

app.get("/hud/mode/:mode", (req, res) => {
  const modeKey = req.params.mode;
  const config = MODE_CONFIGS[modeKey] || MODE_CONFIGS.raw_particulate;
  res.render("partials/mode-info", { mode: config });
});

app.listen(PORT, () => {
  console.log(`Particulate Sensor server running on port ${PORT}`);
});
