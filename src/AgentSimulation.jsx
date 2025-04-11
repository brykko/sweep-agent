import React, { useState, useEffect, useRef } from "react";
import Sketch from "react-p5";
import { besseli } from "bessel";

// =============================================================================
// Constants
// =============================================================================
const MATRIX_SIZE = 200;
const DIR_GRID_SIZE = 60;
const SCALE = 100;
const MAX_WEIGHT = 1;

// UI slider ranges
const INTERVAL_RANGE = [100, 1000]; // Milliseconds
const STEP_SIZE_RANGE = [1, 5];     // Pixels
const TRACE_FF_RANGE = [0.5, 1.0];
const SWEEP_KAPPA_RANGE = [0.1, 10.0];

// =============================================================================
// Utility Functions
// =============================================================================

// Generate the position grid (x and y arrays)
const generatePosGrid = () => {
  const positions = Array.from({ length: MATRIX_SIZE }, (_, i) => (i * SCALE) / MATRIX_SIZE);
  const xx = positions.map(() => [...positions]).flat();
  const yy = positions.map(val => Array(MATRIX_SIZE).fill(val)).flat();
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
const calcSweepWeights = (offsets, sweepDirection, sweepKappa) => {
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
      if (weight > MAX_WEIGHT) weight = MAX_WEIGHT;
      weights[i] = weight;
    }
    result[d] = weights;
  }
  return result;
};

// Pure simulation update function.
// It computes the new agent position and updates the trace (after fading) based on the optimal sweep.
const pureSimulationUpdate = (baseState, directions, sweepKappa, xx, yy, stepSize, traceFF) => {
  const { trace, agentPos } = baseState;
  
  // Compute new agent position.
  const newAgentPos = {
    x: (agentPos.x + stepSize) % SCALE,
    y: (agentPos.y + stepSize) % SCALE,
  };

  // Fade the existing trace.
  const fadedTrace = trace.map(val => val * traceFF);

  // Compute spatial offsets, weights for all directions, then choose the optimal direction.
  const offsets = calcSpatialOffsets(newAgentPos, xx, yy);
  const allWeights = calcSweepWeights(offsets, directions, sweepKappa);
  const optimalDir = selectOptimalDirection(fadedTrace, allWeights, directions);
  const weights = calcSweepWeights(offsets, optimalDir, sweepKappa)[0];

  // Update the trace with the new sweep weights.
  const newTrace = fadedTrace.map((val, i) => val + weights[i]);
  return { newTrace, newAgentPos };
};

// New helper function to draw the robot
const drawRobot = (p5, x, y, size, phase, orientation) => {
  p5.push();
  // Translate to (x, y) so that (0,0) becomes the center of the robot
  p5.translate(x, y);
  // Rotate the coordinate system by the specified orientation
  p5.rotate(-orientation);

  // Set up stroke for the legs
  p5.stroke(255, 255, 255); // White color for legs
  p5.strokeWeight(10);

  // Calculate leg parameters
  const strideLength = 20;
  const legOffset = size * 0.3;

  // Draw left leg: oscillate vertically using sine function
  const leftOsc = p5.sin(phase) * strideLength;
  // Legs originate from (–legOffset, size/2)
  p5.line(-legOffset, 0, -legOffset, leftOsc);

  // Draw right leg: opposite phase
  const rightOsc = p5.sin(phase + Math.PI) * strideLength;
  p5.line(legOffset, 0, legOffset, rightOsc);

  // Draw the robot's body as a circle centered at (0,0)
  p5.fill(200);
  p5.stroke(0);
  p5.strokeWeight(0);
  p5.ellipse(0, 0, size, size);

  p5.pop();
};

// =============================================================================
// Pre-computed constant grids (they never change)
// =============================================================================
const { xx, yy } = generatePosGrid();
const gvdir = generateDirGrid();

// =============================================================================
// Main Component: AgentSimulation
// =============================================================================
const AgentSimulation = () => {
  // Simulation settings state.
  const [intervalTime, setIntervalTime] = useState(200);
  const [stepSize, setStepSize] = useState(5);
  const [traceFF, setTraceFF] = useState(0.8);
  const [sweepKappa, setSweepKappa] = useState(5);

  // Unified simulation state stored in a ref to avoid frequent React re-renders
  const simulationStateRef = useRef({
    trace: Array(MATRIX_SIZE * MATRIX_SIZE).fill(0),
    agentPositions: {
      prev: { x: SCALE * 0.1, y: SCALE * 0.1 },
      current: { x: SCALE * 0.1, y: SCALE * 0.1 }
    },
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
        agentPos: simState.agentPositions.current
      };
      const update = pureSimulationUpdate(
        baseState,
        gvdir,
        sweepKappa,
        xx,
        yy,
        stepSize,
        traceFF
      );
      // Update simulation state: shift current to previous and use new agent position
      simulationStateRef.current = {
        trace: update.newTrace,
        agentPositions: {
          prev: simState.agentPositions.current,
          current: update.newAgentPos
        },
        timeStep: simState.timeStep + 1
      };
      accumulatorRef.current -= intervalTime;
    }

    // --- End Simulation Update ---

    // --- Render the simulation state ---
    // Draw the trace image
    const img = p5.createImage(MATRIX_SIZE, MATRIX_SIZE);
    img.loadPixels();
    const simTrace = simulationStateRef.current.trace;
    for (let i = 0; i < MATRIX_SIZE; i++) {
      for (let j = 0; j < MATRIX_SIZE; j++) {
        const idx = i * MATRIX_SIZE + j;
        const value = simTrace[idx] * 255;
        const pixelIndex = idx * 4;
        img.pixels[pixelIndex] = value;
        img.pixels[pixelIndex + 1] = value;
        img.pixels[pixelIndex + 2] = value;
        img.pixels[pixelIndex + 3] = 255;
      }
    }
    img.updatePixels();
    p5.image(img, 0, 0, p5.width, p5.height);

    const cellSize = p5.width / SCALE;
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
    const robotSize = p5.width / 25;
    const phase = p5.millis() / 80; // Adjust divisor to control animation speed

    drawRobot(p5, smoothX * cellSize, smoothY * cellSize, robotSize, phase, orientation);
    // --- End Rendering ---
  };

  return (
    <div>
      {/* UI Controls */}
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
          <strong>Agent Step Size: {stepSize}px</strong>
          <input
            type="range"
            min={STEP_SIZE_RANGE[0]}
            max={STEP_SIZE_RANGE[1]}
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

      <Sketch setup={(p5, parent) => p5.createCanvas(800, 800).parent(parent)} draw={draw} />
    </div>
  );
};

export default AgentSimulation;