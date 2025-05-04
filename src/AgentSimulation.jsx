import React, { useState, useEffect, useRef } from "react";
import Sketch from "react-p5";
import { besseli } from "bessel";
import { useSearchParams } from "react-router-dom";

// =============================================================================
// Constants
// =============================================================================
const DEFAULT_RESOLUTION = 201;
const DEFAULT_SIZE = 1;
const DEFAULT_STEP_SIZE = 0.03;
const DEFAULT_MARGIN = 0.05;

const DIR_GRID_SIZE = 60;
const DEFAULT_WEIGHT_COEFF = 0.001; // normalizing factor
const MAX_WEIGHT = 1;

// UI slider ranges
const INTERVAL_RANGE = [100, 1000]; // Milliseconds
const STEP_SIZE_RANGE = [0.01, 0.2];     // Pixels
const TRACE_FF_RANGE = [0.5, 1.0];
const SWEEP_KAPPA_RANGE = [0.1, 10.0];

// =============================================================================
// Utility Functions
// =============================================================================

// Generate the position grid (x and y arrays)
const generatePosGrid = (nx, ny, xsize, ysize) => {
  const xPositions = Array.from({ length: nx }, (_, i) => (i/(nx-1) * xsize) );
  const yPositions = Array.from({ length: ny }, (_, i) => (i/(ny-1) * ysize) );
  // console.log("x bins:", xPositions);
  const xx = [];
  const yy = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      xx.push(xPositions[i]);
      yy.push(yPositions[j]);
    }
  }
  return { xx, yy };
};

// Generate the grid of possible sweep directions (radians)
const generateDirGrid = () => {
  const step = (2 * Math.PI) / DIR_GRID_SIZE;
  return Array.from({ length: DIR_GRID_SIZE }, (_, i) => -Math.PI + i * step);
};

// Choose the optimal sweep direction based on overlap with the trace
const selectOptimalDirection = (trace, weightsAll, directions) => {
  const overlapScores = weightsAll.map(weights =>
    weights.reduce((sum, weight, i) => sum + weight * trace[i], 0)
  );
  const bestIndex = overlapScores.indexOf(Math.min(...overlapScores));
  return directions[bestIndex];
};

// Calculate spatial offsets: distances and angles from the agent position to each grid point.
const calcSpatialOffsets = (agentPos, xx, yy) => {
  const len = xx.length;
  const distances = new Float64Array(len);
  const angles = new Float64Array(len);
  for (let i = 0; i < len; i++) {
    const dx = xx[i] - agentPos.x;
    const dy = yy[i] - agentPos.y;
    distances[i] = Math.hypot(dx, dy);
    angles[i] = Math.atan2(dy, dx);
  }
  return { distances, angles };
};

// Compute sweep weights given spatial offsets and sweep parameters.
// Returns an array (for each direction) of typed arrays containing the weights.
const calcSweepWeights = (offsets, sweepDirection, sweepKappa, weightCoeff) => {
  const { distances, angles } = offsets;
  const len = distances.length;

  // Ensure sweepDirection is an array.
  const directions = Array.isArray(sweepDirection) ? sweepDirection : [sweepDirection];
  const numDirs = directions.length;
  const result = new Array(numDirs);
  const normalization = besseli(sweepKappa, 0); // Bessel normalization factor

  for (let d = 0; d < numDirs; d++) {
    const dir = directions[d];
    const weights = new Float64Array(len);
    for (let i = 0; i < len; i++) {
      let weight = Math.exp(sweepKappa * Math.cos(angles[i] - dir)) /
                   (distances[i] * distances[i] * normalization);
      // Cap the weight at MAX_WEIGHT.
      // console.log("weightCoeff:", weightCoeff);
      weight *= weightCoeff;
      if (weight > MAX_WEIGHT) weight = MAX_WEIGHT;
      weights[i] = weight;
    }
    result[d] = weights;
  }
  return result;
};

// Pure simulation update function.
// It computes the new agent position and updates the trace (after fading) based on the optimal sweep.
const pureSimulationUpdate = (baseState, directions, sweepKappa, xx, yy, stepSize, traceFF, pathMode,
  xsize, ysize, margin, weightCoeff) => {
  const { trace, agentPos } = baseState;
  
  let newAgentPos;
  let newDirection = baseState.direction;

  if (pathMode === "random") {
    // Perturb the direction angle slightly
    const directionPerturbation = (Math.random() - 0.5) * 1; // adjust smoothness
    newDirection += directionPerturbation;

    // Compute proposed position
    const dx = stepSize * Math.cos(newDirection);
    const dy = stepSize * Math.sin(newDirection);
    let newX = agentPos.x + dx;
    let newY = agentPos.y + dy;

    // Reflect off margin-adjusted boundaries
    if (newX < margin || newX > xsize - margin) {
      newDirection = Math.PI - newDirection;
      newX = agentPos.x - dx;
    }
    if (newY < margin || newY > ysize - margin) {
      newDirection = -newDirection;
      newY = agentPos.y - dy;
    }

    newAgentPos = { x: newX, y: newY };
  } else {
    // Default linear mode
    newAgentPos = {
      x: agentPos.x + stepSize,
      y: agentPos.y + stepSize
    };
    // Clamp within margin bounds
    if (newAgentPos.x > xsize - margin) {newAgentPos.x = margin;}
    if (newAgentPos.y > ysize - margin) {newAgentPos.y = margin;}
    // newAgentPos.x = Math.max(margin, Math.min(newAgentPos.x, xsize - margin));
    // newAgentPos.y = Math.max(margin, Math.min(newAgentPos.y, ysize - margin));
  }

  // console.log("agent x:", newAgentPos.x);
  // console.log("agent y:", newAgentPos.y);

  // Fade the existing trace.
  const fadedTrace = trace.map(val => val * traceFF);

  // Compute spatial offsets, weights for all directions, then choose the optimal direction.
  const offsets = calcSpatialOffsets(newAgentPos, xx, yy);
  const allWeights = calcSweepWeights(offsets, directions, sweepKappa, weightCoeff);
  const optimalDir = selectOptimalDirection(fadedTrace, allWeights, directions);
  const weights = calcSweepWeights(offsets, optimalDir, sweepKappa, weightCoeff)[0];

  // Update the trace with the new sweep weights.
  const newTrace = fadedTrace.map((val, i) => val + weights[i]);
  return { newTrace, newAgentPos, newDirection: newDirection };
};

// New helper function to draw the robot
const drawRobot = (p5, x, y, size, phase, orientation) => {
  p5.push();
  // Translate to (x, y) so that (0,0) becomes the center of the robot
  p5.translate(x, y);
  // Rotate the coordinate system by the specified orientation
  p5.rotate(orientation + Math.PI/2);

  // Set up stroke for the legs
  p5.stroke(150, 150, 255); // White color for legs
  p5.strokeWeight(size/2);

  // Calculate leg parameters
  const strideLength = size;
  const legOffset = size * 0.3;

  // Draw left leg: oscillate vertically using sine function
  const leftOsc = p5.sin(phase) * strideLength;
  // Legs originate from (–legOffset, size/2)
  p5.line(-legOffset, 0, -legOffset, leftOsc);

  // Draw right leg: opposite phase
  const rightOsc = p5.sin(phase + Math.PI) * strideLength;
  p5.line(legOffset, 0, legOffset, rightOsc);

  // Draw the robot's body as a circle centered at (0,0)
  p5.fill(100, 100, 200);
  p5.stroke(0);
  p5.strokeWeight(0);
  p5.ellipse(0, 0, size, size);

  p5.pop();
};

// =============================================================================
// Main Component: AgentSimulation
// =============================================================================
const AgentSimulation = () => {

    // Parse the URL params
  const [searchParams] = useSearchParams();
  const xsize = parseFloat(searchParams.get("xsize")) || DEFAULT_SIZE; // extent of x dimension (in distance units)
  const ysize = parseFloat(searchParams.get("ysize")) || DEFAULT_SIZE; // extent of y dimension (in distance units)
  const resolution = parseFloat(searchParams.get("resolution")) || DEFAULT_RESOLUTION; // bins per distance unit
  const showSliders = searchParams.get("showSliders") === "1";
  const pathMode = searchParams.get("pathMode") || "linear";
  const initialStepSize = parseFloat(searchParams.get("stepSize")) || DEFAULT_STEP_SIZE;
  const margin = parseFloat(searchParams.get("margin")) || DEFAULT_MARGIN;
  const weightCoeff = parseFloat(searchParams.get("weightCoeff")) || DEFAULT_WEIGHT_COEFF;

  // Calculate position scaling
  console.log("resolution:", resolution);
  const nx = Math.ceil(xsize * resolution); // number of bins in x dimension
  const ny = Math.ceil(ysize * resolution); // number of bins in y dimension
  console.log("nx:", nx);
  console.log("ny:", ny);
  const { xx, yy } = generatePosGrid(nx, ny, xsize, ysize);
  const gvdir = generateDirGrid();

  const containerRef = useRef(null);
  const p5Ref = useRef(null);


  // Simulation settings state.
  const [intervalTime, setIntervalTime] = useState(400);
  const [stepSize, setStepSize] = useState(initialStepSize);
  const [traceFF, setTraceFF] = useState(0.8);
  const [sweepKappa, setSweepKappa] = useState(5);

  // Unified simulation state stored in a ref to avoid frequent React re-renders
  const simulationStateRef = useRef({
    trace: Array(nx * ny).fill(0),
    agentPositions: {
      prev: { x: margin + 0.01, y: margin + 0.01 },
      current: { x: margin + 0.01, y: margin + 0.01 }
    },
    direction: Math.random() * 2 * Math.PI,
    timeStep: 0
  });

  // Ref for accumulating elapsed time for fixed timestep simulation updates
  const accumulatorRef = useRef(0);
  
  // Ref for tracking the last simulation update time
  const lastSimTimeRef = useRef(performance.now());

  // p5.js drawing function.
  const draw = (p5) => {
    // --- Update simulation state using fixed timestep ---
    const now = performance.now();
    const dt = now - lastSimTimeRef.current;
    lastSimTimeRef.current = now;
    accumulatorRef.current += dt;

    // Run simulation updates if enough time has accumulated
    while (accumulatorRef.current >= intervalTime) {
      const simState = simulationStateRef.current;
      // Use the current simulation state as the base
      const baseState = {
        trace: simState.trace,
        agentPos: simState.agentPositions.current,
        direction: simState.direction
      };
      const update = pureSimulationUpdate(
        baseState,
        gvdir,
        sweepKappa,
        xx,
        yy,
        stepSize,
        traceFF,
        pathMode,
        xsize,
        ysize,
        margin,
        weightCoeff
      );
      // Update simulation state: shift current to previous and use new agent position
      simulationStateRef.current = {
        trace: update.newTrace,
        agentPositions: {
          prev: simState.agentPositions.current,
          current: update.newAgentPos
        },
        direction: update.newDirection,
        timeStep: simState.timeStep + 1
      };
      accumulatorRef.current -= intervalTime;
    }

    // --- End Simulation Update ---

    // --- Render the simulation state ---
    // Draw the trace image
    const img = p5.createImage(nx, ny);
    img.loadPixels();
    const simTrace = simulationStateRef.current.trace;
    for (let row = 0; row < ny; row++) {
      for (let col = 0; col < nx; col++) {
        const idx = row * nx + col;
        const value = simTrace[idx] * 255;
        const pixelIndex = idx * 4;
        img.pixels[pixelIndex] = value;
        img.pixels[pixelIndex + 1] = value;
        img.pixels[pixelIndex + 2] = value;
        img.pixels[pixelIndex + 3] = 255; // alpha
      }
    }
    img.updatePixels();
    p5.image(img, 0, 0, p5.width, p5.height);

    // Compute interpolation factor based on the remaining accumulated time
    let t = Math.min(accumulatorRef.current / intervalTime, 1);
    const { prev, current } = simulationStateRef.current.agentPositions;
    // Compute the Euclidean distance between prev and current positions
    const dx = current.x - prev.x;
    const dy = current.y - prev.y;
    const distance = Math.hypot(dx, dy);
    // Define a jump threshold (if the distance exceeds twice the step size, then jump instantly)
    const jumpThreshold = stepSize * 2;
    if (distance > jumpThreshold) {
      t = 1;
    }
    const smoothX = p5.lerp(prev.x, current.x, t);
    const smoothY = p5.lerp(prev.y, current.y, t);

    // Compute the orientation based on the difference between current and previous positions
    const orientation = Math.atan2(current.y - prev.y, current.x - prev.x);

    // Instead of drawing a red dot, draw the vector-animated robot with orientation
    // console.log("P5.width", p5.width);
    const robotSize = p5.width / 20;
    const phase = p5.millis() / 80; // Adjust divisor to control animation speed

    // We'll be drawing the robot in *pixel coordinates*, so we need to convert our position units
    // into pixels.
    const resolutionPx = p5.width / xsize;
    // console.log("smoothX:", smoothX);

    drawRobot(p5, smoothX * resolutionPx, smoothY * resolutionPx, robotSize, phase, orientation);
    // --- End Rendering ---
  };

  useEffect(() => {
    const handleResize = () => {
      if (!p5Ref.current) return;
      // Always fill width, compute height from width × (ny/nx)
      const container = containerRef.current || p5Ref.current.canvas.parentNode;
      const containerWidth = container.clientWidth;
      const canvasWidth = containerWidth;
      const canvasHeight = containerWidth * (ny / nx);
      console.log("RESIZE to ", canvasHeight, " x ", canvasHeight);
      p5Ref.current.resizeCanvas(canvasWidth, canvasHeight);
    };
    window.addEventListener('resize', handleResize);
    // Initial sizing
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, [nx, ny]);

  return (
    <div ref={containerRef} style={{ width: 300+'px', height: '100%', backgroundColor: 'transparent' }}>
      {/* UI Controls */}
      {showSliders && (
        <div style={{ marginBottom: "20px" }}>
          <label>
            <strong>Update Interval: {intervalTime}ms</strong>
            <input
              type="range"
              min={INTERVAL_RANGE[0]}
              max={INTERVAL_RANGE[1]}
              value={intervalTime}
              onChange={(e) => setIntervalTime(Number(e.target.value))}
            />
          </label>
          <br />
          <label>
            <strong>Agent Step Size: {stepSize}</strong>
            <input
              type="range"
              min={STEP_SIZE_RANGE[0]}
              max={STEP_SIZE_RANGE[1]}
              step={0.001}
              value={stepSize}
              onChange={(e) => setStepSize(Number(e.target.value))}
            />
          </label>
          <br />
          <label>
            <strong>Trace Forgetting Factor: {traceFF}</strong>
            <input
              type="range"
              min={TRACE_FF_RANGE[0]}
              max={TRACE_FF_RANGE[1]}
              step={0.01}
              value={traceFF}
              onChange={(e) => setTraceFF(Number(e.target.value))}
            />
          </label>
          <br />
          <label>
            <strong>Sweep Angular Concentration: {sweepKappa}</strong>
            <input
              type="range"
              min={SWEEP_KAPPA_RANGE[0]}
              max={SWEEP_KAPPA_RANGE[1]}
              step={0.1}
              value={sweepKappa}
              onChange={(e) => setSweepKappa(Number(e.target.value))}
            />
          </label>
        </div>
      )}

      <Sketch setup={(p5, parent) => {
        p5Ref.current = p5;
        // Always fill width, compute height from width × (ny/nx)
        const container = containerRef.current || parent;
        const containerWidth = container.clientWidth;
        console.log("Container width:", containerWidth);
        const canvasWidth = containerWidth;
        const canvasHeight = containerWidth * (ny / nx);
        p5.createCanvas(canvasWidth, canvasHeight).parent(container);
        p5.clear(); // Ensure canvas is transparent initially
      }} draw={draw} />
    </div>
  );
};

export default AgentSimulation;