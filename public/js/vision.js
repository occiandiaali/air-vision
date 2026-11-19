let cvReady = false;
let streaming = false;
let currentMode = "mist";
let facingMode = "environment"; // Default to rear camera on mobile
let currentStream = null;

const video = document.getElementById("videoInput");
const canvas = document.getElementById("canvasOutput");
const ctx = canvas.getContext("2d");

const loaderOverlay = document.getElementById("loaderOverlay");
const loaderText = document.getElementById("loaderText");
const startCamBtn = document.getElementById("startCamBtn");
const statusDot = document.getElementById("statusDot");
const fpsCounter = document.getElementById("fpsCounter");
const particleIndex = document.getElementById("particleIndex");

// Sliders
const sensitivitySlider = document.getElementById("sensitivitySlider");
const mistPersistenceSlider = document.getElementById("mistPersistenceSlider");

// Called when OpenCV.js finishes loading WASM
function onOpenCvReady() {
  if (cv.getBuildInformation) {
    initApp();
  } else {
    cv["onRuntimeInitialized"] = initApp;
  }
}

function initApp() {
  cvReady = true;
  loaderText.textContent = "OpenCV Engine Ready. Requesting Camera Access...";
  startCamBtn.classList.remove("hidden");
  startCamera();
}

startCamBtn.addEventListener("click", startCamera);

document.getElementById("flipCamBtn").addEventListener("click", () => {
  facingMode = facingMode === "environment" ? "user" : "environment";
  startCamera();
});

// Mode button active state management
document.querySelectorAll(".mode-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll(".mode-btn")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentMode = btn.dataset.mode;
  });
});

async function startCamera() {
  if (currentStream) {
    currentStream.getTracks().forEach((track) => track.stop());
    streaming = false;
  }

  try {
    // Request moderate resolution for high mobile FPS (640x480 scales smoothly)
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

    video.onloadedmetadata = () => {
      video.play();
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      loaderOverlay.classList.add("hidden");
      statusDot.classList.add("active");
      streaming = true;
      requestAnimationFrame(processVideoLoop);
    };
  } catch (err) {
    loaderText.textContent = `Camera permission required (HTTPS needed): ${err.message}`;
    startCamBtn.classList.remove("hidden");
  }
}

function processVideoLoop() {
  if (!streaming || !cvReady) return;

  const width = video.videoWidth;
  const height = video.videoHeight;

  // Allocate reusable OpenCV matrices
  let src = new cv.Mat(height, width, cv.CV_8UC4);
  let gray = new cv.Mat(height, width, cv.CV_8UC1);
  let prevGray = new cv.Mat(height, width, cv.CV_8UC1);
  let diff = new cv.Mat(height, width, cv.CV_8UC1);
  let thresh = new cv.Mat(height, width, cv.CV_8UC1);
  let mistBuffer = new cv.Mat.zeros(height, width, cv.CV_8UC1);
  let mistBlurred = new cv.Mat(height, width, cv.CV_8UC1);
  let mistColor = new cv.Mat(height, width, cv.CV_8UC4);
  let dst = new cv.Mat(height, width, cv.CV_8UC4);

  // Offscreen canvas to grab frames cleanly on mobile browsers
  const capCanvas = document.createElement("canvas");
  capCanvas.width = width;
  capCanvas.height = height;
  const capCtx = capCanvas.getContext("2d", { willReadFrequently: true });

  // Seed initial previous frame
  capCtx.drawImage(video, 0, 0, width, height);
  src.data.set(capCtx.getImageData(0, 0, width, height).data);
  cv.cvtColor(src, prevGray, cv.COLOR_RGBA2GRAY);

  // CLAHE for boosting faint airborne light scatter
  let clahe = new cv.CLAHE(3.0, new cv.Size(8, 8));

  let frameCount = 0;
  let lastFpsTime = performance.now();

  function renderFrame() {
    if (!streaming) {
      // Clean up WASM heap memory when camera stops/flips
      src.delete();
      gray.delete();
      prevGray.delete();
      diff.delete();
      thresh.delete();
      mistBuffer.delete();
      mistBlurred.delete();
      mistColor.delete();
      dst.delete();
      clahe.delete();
      return;
    }

    const now = performance.now();
    frameCount++;
    if (now - lastFpsTime >= 1000) {
      fpsCounter.textContent = `${frameCount} FPS`;
      frameCount = 0;
      lastFpsTime = now;
    }

    // 1. Capture current frame
    capCtx.drawImage(video, 0, 0, width, height);
    src.data.set(capCtx.getImageData(0, 0, width, height).data);

    // 2. Grayscale + CLAHE contrast enhancement for faint particulates
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    clahe.apply(gray, gray);

    // 3. Temporal Frame Differencing (isolates moving particulates from static room)
    cv.absdiff(gray, prevGray, diff);

    // Threshold based on user sensitivity slider (inverted so higher slider = lower threshold)
    const sensVal = parseInt(sensitivitySlider.value, 10);
    const threshCutoff = Math.max(4, 65 - sensVal);
    cv.threshold(diff, thresh, threshCutoff, 255, cv.THRESH_BINARY);

    // Remove single-pixel camera sensor noise
    let kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3, 3));
    cv.morphologyEx(thresh, thresh, cv.MORPH_OPEN, kernel);
    kernel.delete();

    // Calculate relative particulate activity index
    const nonZero = cv.countNonZero(thresh);
    const densityPct = ((nonZero / (width * height)) * 100).toFixed(2);
    particleIndex.textContent = `DENSITY: ${densityPct}%`;

    // 4. Mist / Dispersion Accumulation Buffer
    const decay = parseInt(mistPersistenceSlider.value, 10) / 100; // e.g., 0.85
    cv.addWeighted(mistBuffer, decay, thresh, 0.65, 0, mistBuffer);

    // Diffuse the accumulated particles into a soft mist/fog plume
    cv.GaussianBlur(
      mistBuffer,
      mistBlurred,
      new cv.Size(21, 21),
      0,
      0,
      cv.BORDER_DEFAULT,
    );

    // 5. Render selected visualization mode
    if (currentMode === "mist") {
      // Tint mist buffer cyan-white and blend smoothly over dimmed camera feed
      cv.cvtColor(mistBlurred, mistColor, cv.COLOR_GRAY2RGBA);
      // Enhance cyan channel on mist
      let channels = new cv.MatVector();
      cv.split(mistColor, channels);
      // Reduce red channel slightly so mist looks like illuminated cool vapor
      cv.multiply(
        channels.get(0),
        new cv.Mat(height, width, cv.CV_8UC1, new cv.Scalar(0.45)),
        channels.get(0),
      );
      cv.merge(channels, mistColor);
      channels.delete();

      cv.addWeighted(src, 0.78, mistColor, 0.95, 0, dst);
    } else if (currentMode === "raw_particulate") {
      // High-contrast particulate speck view (highlights sharp dots + light halo)
      cv.addWeighted(thresh, 0.8, mistBlurred, 0.4, 0, mistBlurred);
      cv.cvtColor(mistBlurred, mistColor, cv.COLOR_GRAY2RGBA);
      cv.addWeighted(src, 0.55, mistColor, 1.0, 0, dst);
    } else if (currentMode === "density_heatmap") {
      // Apply pseudo-thermal colormap to visualize clustering & dispersion pockets
      let colorMapBgr = new cv.Mat();
      cv.applyColorMap(mistBlurred, colorMapBgr, cv.COLORMAP_INFERNO);
      cv.cvtColor(colorMapBgr, mistColor, cv.COLOR_BGR2RGBA);
      colorMapBgr.delete();

      cv.addWeighted(src, 0.65, mistColor, 0.65, 0, dst);
    }

    // Output to visible canvas
    cv.imshow("canvasOutput", dst);

    // Update previous frame reference
    gray.copyTo(prevGray);

    requestAnimationFrame(renderFrame);
  }

  requestAnimationFrame(renderFrame);
}
