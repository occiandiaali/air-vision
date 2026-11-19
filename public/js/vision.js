// let cvReady = false;
// let streaming = false;
// let currentMode = "mist";
// let facingMode = "environment"; // Default to rear camera on mobile
// let currentStream = null;

// const video = document.getElementById("videoInput");
// const canvas = document.getElementById("canvasOutput");
// const ctx = canvas.getContext("2d");

// const loaderOverlay = document.getElementById("loaderOverlay");
// const loaderText = document.getElementById("loaderText");
// const startCamBtn = document.getElementById("startCamBtn");
// const statusDot = document.getElementById("statusDot");
// const fpsCounter = document.getElementById("fpsCounter");
// const particleIndex = document.getElementById("particleIndex");

// // Sliders
// const sensitivitySlider = document.getElementById("sensitivitySlider");
// const mistPersistenceSlider = document.getElementById("mistPersistenceSlider");

// // Called when OpenCV.js finishes loading WASM
// function onOpenCvReady() {
//   if (cv.getBuildInformation) {
//     initApp();
//   } else {
//     cv["onRuntimeInitialized"] = initApp;
//   }
// }

// function initApp() {
//   cvReady = true;
//   loaderText.textContent = "OpenCV Engine Ready. Requesting Camera Access...";
//   startCamBtn.classList.remove("hidden");
//   startCamera();
// }

// startCamBtn.addEventListener("click", startCamera);

// document.getElementById("flipCamBtn").addEventListener("click", () => {
//   facingMode = facingMode === "environment" ? "user" : "environment";
//   startCamera();
// });

// // Mode button active state management
// document.querySelectorAll(".mode-btn").forEach((btn) => {
//   btn.addEventListener("click", () => {
//     document
//       .querySelectorAll(".mode-btn")
//       .forEach((b) => b.classList.remove("active"));
//     btn.classList.add("active");
//     currentMode = btn.dataset.mode;
//   });
// });

// async function startCamera() {
//   if (currentStream) {
//     currentStream.getTracks().forEach((track) => track.stop());
//     streaming = false;
//   }

//   try {
//     // Request moderate resolution for high mobile FPS (640x480 scales smoothly)
//     const constraints = {
//       video: {
//         facingMode: { ideal: facingMode },
//         width: { ideal: 640 },
//         height: { ideal: 480 },
//       },
//       audio: false,
//     };

//     currentStream = await navigator.mediaDevices.getUserMedia(constraints);
//     video.srcObject = currentStream;

//     video.onloadedmetadata = () => {
//       video.play();
//       canvas.width = video.videoWidth;
//       canvas.height = video.videoHeight;
//       loaderOverlay.classList.add("hidden");
//       statusDot.classList.add("active");
//       streaming = true;
//       requestAnimationFrame(processVideoLoop);
//     };
//   } catch (err) {
//     loaderText.textContent = `Camera permission required (HTTPS needed): ${err.message}`;
//     startCamBtn.classList.remove("hidden");
//   }
// }

// function processVideoLoop() {
//   if (!streaming || !cvReady) return;

//   const width = video.videoWidth;
//   const height = video.videoHeight;

//   // Allocate reusable OpenCV matrices
//   let src = new cv.Mat(height, width, cv.CV_8UC4);
//   let gray = new cv.Mat(height, width, cv.CV_8UC1);
//   let prevGray = new cv.Mat(height, width, cv.CV_8UC1);
//   let diff = new cv.Mat(height, width, cv.CV_8UC1);
//   let thresh = new cv.Mat(height, width, cv.CV_8UC1);
//   let mistBuffer = new cv.Mat.zeros(height, width, cv.CV_8UC1);
//   let mistBlurred = new cv.Mat(height, width, cv.CV_8UC1);
//   let mistColor = new cv.Mat(height, width, cv.CV_8UC4);
//   let dst = new cv.Mat(height, width, cv.CV_8UC4);

//   // Offscreen canvas to grab frames cleanly on mobile browsers
//   const capCanvas = document.createElement("canvas");
//   capCanvas.width = width;
//   capCanvas.height = height;
//   const capCtx = capCanvas.getContext("2d", { willReadFrequently: true });

//   // Seed initial previous frame
//   capCtx.drawImage(video, 0, 0, width, height);
//   src.data.set(capCtx.getImageData(0, 0, width, height).data);
//   cv.cvtColor(src, prevGray, cv.COLOR_RGBA2GRAY);

//   // CLAHE for boosting faint airborne light scatter
//   let clahe = new cv.CLAHE(3.0, new cv.Size(8, 8));

//   let frameCount = 0;
//   let lastFpsTime = performance.now();

//   function renderFrame() {
//     if (!streaming) {
//       // Clean up WASM heap memory when camera stops/flips
//       src.delete();
//       gray.delete();
//       prevGray.delete();
//       diff.delete();
//       thresh.delete();
//       mistBuffer.delete();
//       mistBlurred.delete();
//       mistColor.delete();
//       dst.delete();
//       clahe.delete();
//       return;
//     }

//     const now = performance.now();
//     frameCount++;
//     if (now - lastFpsTime >= 1000) {
//       fpsCounter.textContent = `${frameCount} FPS`;
//       frameCount = 0;
//       lastFpsTime = now;
//     }

//     // 1. Capture current frame
//     capCtx.drawImage(video, 0, 0, width, height);
//     src.data.set(capCtx.getImageData(0, 0, width, height).data);

//     // 2. Grayscale + CLAHE contrast enhancement for faint particulates
//     cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
//     clahe.apply(gray, gray);

//     // 3. Temporal Frame Differencing (isolates moving particulates from static room)
//     cv.absdiff(gray, prevGray, diff);

//     // Threshold based on user sensitivity slider (inverted so higher slider = lower threshold)
//     const sensVal = parseInt(sensitivitySlider.value, 10);
//     const threshCutoff = Math.max(4, 65 - sensVal);
//     cv.threshold(diff, thresh, threshCutoff, 255, cv.THRESH_BINARY);

//     // Remove single-pixel camera sensor noise
//     let kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3, 3));
//     cv.morphologyEx(thresh, thresh, cv.MORPH_OPEN, kernel);
//     kernel.delete();

//     // Calculate relative particulate activity index
//     const nonZero = cv.countNonZero(thresh);
//     const densityPct = ((nonZero / (width * height)) * 100).toFixed(2);
//     particleIndex.textContent = `DENSITY: ${densityPct}%`;

//     // 4. Mist / Dispersion Accumulation Buffer
//     const decay = parseInt(mistPersistenceSlider.value, 10) / 100; // e.g., 0.85
//     cv.addWeighted(mistBuffer, decay, thresh, 0.65, 0, mistBuffer);

//     // Diffuse the accumulated particles into a soft mist/fog plume
//     cv.GaussianBlur(
//       mistBuffer,
//       mistBlurred,
//       new cv.Size(21, 21),
//       0,
//       0,
//       cv.BORDER_DEFAULT,
//     );

//     // 5. Render selected visualization mode
//     if (currentMode === "mist") {
//       // Tint mist buffer cyan-white and blend smoothly over dimmed camera feed
//       cv.cvtColor(mistBlurred, mistColor, cv.COLOR_GRAY2RGBA);
//       // Enhance cyan channel on mist
//       let channels = new cv.MatVector();
//       cv.split(mistColor, channels);
//       // Reduce red channel slightly so mist looks like illuminated cool vapor
//       cv.multiply(
//         channels.get(0),
//         new cv.Mat(height, width, cv.CV_8UC1, new cv.Scalar(0.45)),
//         channels.get(0),
//       );
//       cv.merge(channels, mistColor);
//       channels.delete();

//       cv.addWeighted(src, 0.78, mistColor, 0.95, 0, dst);
//     } else if (currentMode === "raw_particulate") {
//       // High-contrast particulate speck view (highlights sharp dots + light halo)
//       cv.addWeighted(thresh, 0.8, mistBlurred, 0.4, 0, mistBlurred);
//       cv.cvtColor(mistBlurred, mistColor, cv.COLOR_GRAY2RGBA);
//       cv.addWeighted(src, 0.55, mistColor, 1.0, 0, dst);
//     } else if (currentMode === "density_heatmap") {
//       // Apply pseudo-thermal colormap to visualize clustering & dispersion pockets
//       let colorMapBgr = new cv.Mat();
//       cv.applyColorMap(mistBlurred, colorMapBgr, cv.COLORMAP_INFERNO);
//       cv.cvtColor(colorMapBgr, mistColor, cv.COLOR_BGR2RGBA);
//       colorMapBgr.delete();

//       cv.addWeighted(src, 0.65, mistColor, 0.65, 0, dst);
//     }

//     // Output to visible canvas
//     cv.imshow("canvasOutput", dst);

//     // Update previous frame reference
//     gray.copyTo(prevGray);

//     requestAnimationFrame(renderFrame);
//   }

//   requestAnimationFrame(renderFrame);
// }

let cvReady = false;
let streaming = false;
let currentMode = "raw_particulate";
let showFlowVectors = true;
let facingMode = "environment";
let currentStream = null;

const launchScreen = document.getElementById("launchScreen");
const arViewport = document.getElementById("arViewport");
const engineStatus = document.getElementById("engineStatus");
const launchBtn = document.getElementById("launchBtn");
const homeBtn = document.getElementById("homeBtn");
const flowToggleBtn = document.getElementById("flowToggleBtn");

const video = document.getElementById("videoInput");
const canvas = document.getElementById("canvasOutput");
const ctx = canvas.getContext("2d");

const statusDot = document.getElementById("statusDot");
const fpsCounter = document.getElementById("fpsCounter");
const particleIndex = document.getElementById("particleIndex");

const sensitivitySlider = document.getElementById("sensitivitySlider");
const mistPersistenceSlider = document.getElementById("mistPersistenceSlider");

function onOpenCvReady() {
  if (cv.getBuildInformation) {
    markCvReady();
  } else {
    cv["onRuntimeInitialized"] = markCvReady;
  }
}

function markCvReady() {
  cvReady = true;
  engineStatus.textContent = "OpenCV.js WASM engine ready.";
  launchBtn.disabled = false;
}

launchBtn.addEventListener("click", async () => {
  if (!cvReady) return;
  launchScreen.classList.add("hidden");
  arViewport.classList.remove("hidden");
  await startCamera();
});

homeBtn.addEventListener("click", () => {
  stopCamera();
  arViewport.classList.add("hidden");
  launchScreen.classList.remove("hidden");
});

flowToggleBtn.addEventListener("click", () => {
  showFlowVectors = !showFlowVectors;
  flowToggleBtn.classList.toggle("active", showFlowVectors);
  flowToggleBtn.textContent = `Flow Arrows: ${showFlowVectors ? "ON" : "OFF"}`;
});

document.getElementById("flipCamBtn").addEventListener("click", async () => {
  facingMode = facingMode === "environment" ? "user" : "environment";
  await startCamera();
});

document.querySelectorAll(".mode-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll(".mode-btn")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentMode = btn.dataset.mode;
  });
});

function stopCamera() {
  streaming = false;
  statusDot.classList.remove("active");
  if (currentStream) {
    currentStream.getTracks().forEach((track) => track.stop());
    currentStream = null;
  }
}

async function startCamera() {
  stopCamera();

  try {
    const constraints = {
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: 640 },
        height: { ideal: 480 },
      },
      audio: false,
    };

    currentStream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = currentStream;

    video.onloadedmetadata = async () => {
      await video.play();
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      statusDot.classList.add("active");
      streaming = true;
      runVisionLoop();
    };
  } catch (err) {
    alert(`Camera access failed (HTTPS is required on mobile): ${err.message}`);
    homeBtn.click();
  }
}

function drawFlowVectors(prevGray, currGray, width, height) {
  let corners = new cv.Mat();
  let nextPts = new cv.Mat();
  let status = new cv.Mat();
  let err = new cv.Mat();

  try {
    // Detect up to 45 salient moving/textured points
    cv.goodFeaturesToTrack(
      currGray,
      corners,
      45,
      0.02,
      12,
      new cv.Mat(),
      7,
      false,
    );
    if (corners.rows > 0) {
      cv.calcOpticalFlowPyrLK(
        prevGray,
        currGray,
        corners,
        nextPts,
        status,
        err,
        new cv.Size(15, 15),
        2,
      );

      ctx.save();
      ctx.strokeStyle = "rgba(0, 240, 255, 0.85)";
      ctx.fillStyle = "rgba(0, 240, 255, 0.85)";
      ctx.lineWidth = 1.6;

      for (let i = 0; i < status.rows; i++) {
        if (status.data[i] === 1) {
          const x0 = corners.data32F[i * 2];
          const y0 = corners.data32F[i * 2 + 1];
          const x1 = nextPts.data32F[i * 2];
          const y1 = nextPts.data32F[i * 2 + 1];

          const dx = x1 - x0;
          const dy = y1 - y0;
          const mag = Math.hypot(dx, dy);

          // Filter out tiny jitter and huge camera-shake jumps
          if (mag > 1.5 && mag < 35) {
            // Amplify arrow length slightly so drift is easy to read
            const endX = x0 + dx * 2.2;
            const endY = y0 + dy * 2.2;

            ctx.beginPath();
            ctx.moveTo(x0, y0);
            ctx.lineTo(endX, endY);
            ctx.stroke();

            const angle = Math.atan2(endY - y0, endX - x0);
            const headLen = 6;
            ctx.beginPath();
            ctx.moveTo(endX, endY);
            ctx.lineTo(
              endX - headLen * Math.cos(angle - Math.PI / 6),
              endY - headLen * Math.sin(angle - Math.PI / 6),
            );
            ctx.lineTo(
              endX - headLen * Math.cos(angle + Math.PI / 6),
              endY - headLen * Math.sin(angle + Math.PI / 6),
            );
            ctx.closePath();
            ctx.fill();
          }
        }
      }
      ctx.restore();
    }
  } finally {
    corners.delete();
    nextPts.delete();
    status.delete();
    err.delete();
  }
}

function runVisionLoop() {
  if (!streaming || !cvReady) return;

  const width = canvas.width;
  const height = canvas.height;

  const src = new cv.Mat(height, width, cv.CV_8UC4);
  const gray = new cv.Mat(height, width, cv.CV_8UC1);
  const prevGray = new cv.Mat(height, width, cv.CV_8UC1);
  const topHat = new cv.Mat(height, width, cv.CV_8UC1);
  const diff = new cv.Mat(height, width, cv.CV_8UC1);
  const combinedSignal = new cv.Mat(height, width, cv.CV_8UC1);
  const thresh = new cv.Mat(height, width, cv.CV_8UC1);
  const mistBuffer = new cv.Mat.zeros(height, width, cv.CV_8UC1);
  const mistBlurred = new cv.Mat(height, width, cv.CV_8UC1);
  const orangeOverlay = new cv.Mat(height, width, cv.CV_8UC4);
  const mistOverlay = new cv.Mat(height, width, cv.CV_8UC4);
  const colorMapBgr = new cv.Mat(height, width, cv.CV_8UC3);
  const heatOverlay = new cv.Mat(height, width, cv.CV_8UC4);
  const dst = new cv.Mat(height, width, cv.CV_8UC4);

  // Larger elliptical kernel for top-hat removes broad room walls/lighting
  const tophatKernel = cv.getStructuringElement(
    cv.MORPH_ELLIPSE,
    new cv.Size(15, 15),
  );
  const noiseKernel = cv.getStructuringElement(
    cv.MORPH_ELLIPSE,
    new cv.Size(2, 2),
  );

  const capCanvas = document.createElement("canvas");
  capCanvas.width = width;
  capCanvas.height = height;
  const capCtx = capCanvas.getContext("2d", { willReadFrequently: true });

  capCtx.drawImage(video, 0, 0, width, height);
  src.data.set(capCtx.getImageData(0, 0, width, height).data);
  cv.cvtColor(src, prevGray, cv.COLOR_RGBA2GRAY);

  let frameCount = 0;
  let lastFpsTime = performance.now();

  function cleanup() {
    src.delete();
    gray.delete();
    prevGray.delete();
    topHat.delete();
    diff.delete();
    combinedSignal.delete();
    thresh.delete();
    mistBuffer.delete();
    mistBlurred.delete();
    orangeOverlay.delete();
    mistOverlay.delete();
    colorMapBgr.delete();
    heatOverlay.delete();
    dst.delete();
    tophatKernel.delete();
    noiseKernel.delete();
  }

  function step() {
    if (!streaming) {
      cleanup();
      return;
    }

    try {
      const now = performance.now();
      frameCount++;
      if (now - lastFpsTime >= 1000) {
        fpsCounter.textContent = `${frameCount} FPS`;
        frameCount = 0;
        lastFpsTime = now;
      }

      capCtx.drawImage(video, 0, 0, width, height);
      src.data.set(capCtx.getImageData(0, 0, width, height).data);
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

      // 1. Morphological Top-Hat isolates small bright features from broad backgrounds
      cv.morphologyEx(gray, topHat, cv.MORPH_TOPHAT, tophatKernel);

      // 2. Temporal frame difference captures motion across frames
      cv.absdiff(gray, prevGray, diff);

      // Combine spatial top-hat specks with temporal movement
      cv.max(topHat, diff, combinedSignal);

      const sensVal = parseInt(sensitivitySlider.value, 10);
      const cutoff = Math.max(6, 72 - sensVal);
      cv.threshold(combinedSignal, thresh, cutoff, 255, cv.THRESH_BINARY);
      cv.morphologyEx(thresh, thresh, cv.MORPH_OPEN, noiseKernel);

      const nonZero = cv.countNonZero(thresh);
      const densityPct = ((nonZero / (width * height)) * 100).toFixed(2);
      particleIndex.textContent = `DENSITY: ${densityPct}%`;

      // 3. Mist / dispersion accumulation
      const decay = parseInt(mistPersistenceSlider.value, 10) / 100;
      cv.addWeighted(mistBuffer, decay, thresh, 0.7, 0, mistBuffer);
      cv.GaussianBlur(
        mistBuffer,
        mistBlurred,
        new cv.Size(19, 19),
        0,
        0,
        cv.BORDER_DEFAULT,
      );

      if (currentMode === "raw_particulate") {
        // Build vivid orange mask (#ff6a00) wherever particulates are detected
        orangeOverlay.setTo(new cv.Scalar(255, 106, 0, 255));
        let mask4 = new cv.Mat();
        cv.cvtColor(thresh, mask4, cv.COLOR_GRAY2RGBA);
        let maskedOrange = new cv.Mat();
        cv.bitwise_and(orangeOverlay, mask4, maskedOrange);

        // Slight dim of camera image so orange particles pop against any wall/light
        let dimmedSrc = new cv.Mat();
        cv.convertScaleAbs(src, dimmedSrc, 0.72, 0);
        cv.addOr
          ? cv.add(dimmedSrc, maskedOrange, dst)
          : cv.addWeighted(dimmedSrc, 1.0, maskedOrange, 1.0, 0, dst);

        mask4.delete();
        maskedOrange.delete();
        dimmedSrc.delete();
      } else if (currentMode === "mist") {
        cv.cvtColor(mistBlurred, mistOverlay, cv.COLOR_GRAY2RGBA);
        // Tint cool cyan-white mist cleanly
        let mistTinted = new cv.Mat(
          height,
          width,
          cv.CV_8UC4,
          new cv.Scalar(110, 235, 255, 255),
        );
        let mistMask4 = new cv.Mat();
        cv.cvtColor(mistBlurred, mistMask4, cv.COLOR_GRAY2RGBA);
        cv.bitwise_and(mistTinted, mistMask4, mistOverlay);
        cv.addWeighted(src, 0.82, mistOverlay, 0.85, 0, dst);

        mistTinted.delete();
        mistMask4.delete();
      } else {
        // Cluster Map: safe single-channel to COLORMAP_INFERNO to RGBA
        cv.applyColorMap(mistBlurred, colorMapBgr, cv.COLORMAP_INFERNO);
        cv.cvtColor(colorMapBgr, heatOverlay, cv.COLOR_BGR2RGBA);
        cv.addWeighted(src, 0.65, heatOverlay, 0.7, 0, dst);
      }

      cv.imshow("canvasOutput", dst);

      if (showFlowVectors) {
        drawFlowVectors(prevGray, gray, width, height);
      }

      gray.copyTo(prevGray);
    } catch (err) {
      console.error("Vision frame error:", err);
    }

    if (streaming) {
      requestAnimationFrame(step);
    } else {
      cleanup();
    }
  }

  requestAnimationFrame(step);
}
